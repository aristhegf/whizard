import { randomToken } from "@whizard/game-core";
import {
  completeAssignmentSchema,
  createAssignmentSchema,
  GROUP_MAX_MEMBERS,
  type AssignmentCompletion,
  type AssignmentCompletionWithUser,
  type FriendGroup,
  type GroupAssignment,
  type PublicUser,
} from "@whizard/protocol";
import { requireUser } from "./account";
import { groupFor, toPublic, type PublicRow } from "./friends";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { asAvatar } from "./sessions";

interface AssignmentRow {
  id: string;
  group_id: string;
  bank_id: string;
  assigned_by: string;
  target_score: number | null;
  due_at: number | null;
  notes: string | null;
  created_at: number;
  bank_name: string;
  bank_exam: string | null;
  bank_subject: string | null;
  bank_is_public: number;
  assigner_username: string;
  assigner_display_name: string;
  assigner_avatar: string | null;
  question_count: number;
}

interface CompletionRow {
  assignment_id: string;
  user_id: string;
  score: number;
  total_questions: number;
  accuracy_percent: number;
  attempts_count: number;
  completed_at: number;
  username: string;
  display_name: string;
  avatar: string | null;
}

/** `GET /api/groups/:id`: group details, membership status, and member list. */
export async function getGroup(context: RequestContext): Promise<Response> {
  const groupId = decodeURIComponent(context.params[0] ?? "");
  let currentUserId: string | null = null;
  try {
    const { user } = await requireUser(context);
    currentUserId = user.id;
  } catch {
    // Guest or unauthenticated
  }

  const groupRow = await context.env.DB.prepare(
    `SELECT g.id, g.name, g.owner_id, g.created_at, u.username AS owner_username, u.display_name AS owner_display_name
       FROM friend_groups g
       JOIN users u ON u.id = g.owner_id
      WHERE g.id = ?`,
  )
    .bind(groupId)
    .first<{
      id: string;
      name: string;
      owner_id: string;
      created_at: number;
      owner_username: string;
      owner_display_name: string;
    }>();

  if (!groupRow) {
    throw new HttpError(404, "group_not_found", "That group doesn’t exist.");
  }

  const { results: memberRows } = await context.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar
       FROM friend_group_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ?
      ORDER BY u.display_name COLLATE NOCASE`,
  )
    .bind(groupId)
    .all<PublicRow>();

  const isMember = currentUserId !== null && memberRows.some((m) => m.id === currentUserId);
  const group: FriendGroup = {
    id: groupRow.id,
    name: groupRow.name,
    owner: groupRow.owner_username,
    members: memberRows.map(toPublic),
  };

  return Response.json({ group, isMember }, { headers: { "Cache-Control": "no-store" } });
}

/** `POST /api/groups/:id/join`: join a study group via an assignment or invite link. */
export async function joinGroup(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const groupId = decodeURIComponent(context.params[0] ?? "");

  const group = await context.env.DB.prepare(
    "SELECT id, name, owner_id FROM friend_groups WHERE id = ?",
  )
    .bind(groupId)
    .first<{ id: string; name: string; owner_id: string }>();

  if (!group) {
    throw new HttpError(404, "group_not_found", "That group doesn’t exist.");
  }

  const existingMember = await context.env.DB.prepare(
    "SELECT 1 FROM friend_group_members WHERE group_id = ? AND user_id = ?",
  )
    .bind(groupId, user.id)
    .first();

  if (existingMember) {
    return Response.json({ ok: true, joined: false });
  }

  const memberCount = await context.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM friend_group_members WHERE group_id = ?",
  )
    .bind(groupId)
    .first<{ c: number }>();

  if ((memberCount?.c ?? 0) >= GROUP_MAX_MEMBERS) {
    throw new HttpError(
      400,
      "group_too_big",
      `This group is full (max ${GROUP_MAX_MEMBERS} members).`,
    );
  }

  await context.env.DB.prepare("INSERT INTO friend_group_members (group_id, user_id) VALUES (?, ?)")
    .bind(groupId, user.id)
    .run();

  return Response.json({ ok: true, joined: true }, { status: 201 });
}

/** `GET /api/groups/:id/assignments`: list study assignments for a group with completion stats. */
export async function getGroupAssignments(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const groupId = decodeURIComponent(context.params[0] ?? "");
  await groupFor(context.env, groupId, user.id);

  const { results: assignments } = await context.env.DB.prepare(
    `SELECT a.id, a.group_id, a.bank_id, a.assigned_by, a.target_score, a.due_at, a.notes, a.created_at,
            b.name AS bank_name, b.exam AS bank_exam, b.subject AS bank_subject, b.is_public AS bank_is_public,
            u.username AS assigner_username, u.display_name AS assigner_display_name, u.avatar AS assigner_avatar,
            COALESCE(qc.c, 0) AS question_count
       FROM group_bank_assignments a
       JOIN user_banks b ON b.id = a.bank_id
       JOIN users u ON u.id = a.assigned_by
       LEFT JOIN (
         SELECT bank_id, COUNT(*) AS c FROM user_bank_questions GROUP BY bank_id
       ) qc ON qc.bank_id = a.bank_id
      WHERE a.group_id = ?
      ORDER BY a.created_at DESC`,
  )
    .bind(groupId)
    .all<AssignmentRow>();

  if (assignments.length === 0) {
    return Response.json({ assignments: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const assignmentIds = assignments.map((a) => a.id);
  const placeholders = assignmentIds.map(() => "?").join(",");

  const { results: completionRows } = await context.env.DB.prepare(
    `SELECT c.assignment_id, c.user_id, c.score, c.total_questions, c.accuracy_percent, c.attempts_count, c.completed_at,
            u.username, u.display_name, u.avatar
       FROM group_assignment_completions c
       JOIN users u ON u.id = c.user_id
      WHERE c.assignment_id IN (${placeholders})
      ORDER BY c.score DESC, c.accuracy_percent DESC, c.completed_at ASC`,
  )
    .bind(...assignmentIds)
    .all<CompletionRow>();

  const completionsByAssignment = new Map<string, AssignmentCompletionWithUser[]>();
  for (const c of completionRows) {
    const list = completionsByAssignment.get(c.assignment_id) ?? [];
    list.push({
      score: c.score,
      totalQuestions: c.total_questions,
      accuracyPercent: c.accuracy_percent,
      attemptsCount: c.attempts_count,
      completedAt: c.completed_at,
      user: {
        username: c.username,
        displayName: c.display_name,
        avatar: asAvatar(c.avatar),
      },
    });
    completionsByAssignment.set(c.assignment_id, list);
  }

  const result: GroupAssignment[] = assignments.map((a) => {
    const completions = completionsByAssignment.get(a.id) ?? [];
    const myRow = completionRows.find((c) => c.assignment_id === a.id && c.user_id === user.id);
    const myCompletion: AssignmentCompletion | null = myRow
      ? {
          score: myRow.score,
          totalQuestions: myRow.total_questions,
          accuracyPercent: myRow.accuracy_percent,
          attemptsCount: myRow.attempts_count,
          completedAt: myRow.completed_at,
        }
      : null;

    const assigner: PublicUser = {
      username: a.assigner_username,
      displayName: a.assigner_display_name,
      avatar: asAvatar(a.assigner_avatar),
    };

    return {
      id: a.id,
      groupId: a.group_id,
      bankId: a.bank_id,
      bankName: a.bank_name,
      exam: a.bank_exam,
      subject: a.bank_subject,
      questionCount: a.question_count,
      assignedBy: assigner,
      targetScore: a.target_score,
      dueAt: a.due_at,
      notes: a.notes,
      createdAt: a.created_at,
      myCompletion,
      completions,
    };
  });

  return Response.json({ assignments: result }, { headers: { "Cache-Control": "no-store" } });
}

/** `POST /api/groups/:id/assignments`: assign a question bank to a group. */
export async function createGroupAssignment(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const groupId = decodeURIComponent(context.params[0] ?? "");
  await groupFor(context.env, groupId, user.id);

  const body = await readJson(context.request, createAssignmentSchema);

  const bank = await context.env.DB.prepare(
    "SELECT id, owner_id, is_public, name FROM user_banks WHERE id = ?",
  )
    .bind(body.bankId)
    .first<{ id: string; owner_id: string; is_public: number; name: string }>();

  if (!bank) {
    throw new HttpError(404, "bank_not_found", "The specified question bank does not exist.");
  }

  if (bank.owner_id !== user.id && !bank.is_public) {
    throw new HttpError(
      403,
      "bank_forbidden",
      "You can only assign banks you own or public community banks.",
    );
  }

  const existing = await context.env.DB.prepare(
    "SELECT id FROM group_bank_assignments WHERE group_id = ? AND bank_id = ?",
  )
    .bind(groupId, body.bankId)
    .first<{ id: string }>();

  if (existing) {
    throw new HttpError(
      400,
      "already_assigned",
      "This question bank is already assigned to this group.",
    );
  }

  const id = `asgn_${randomToken(12)}`;
  const now = Date.now();

  await context.env.DB.prepare(
    `INSERT INTO group_bank_assignments (id, group_id, bank_id, assigned_by, target_score, due_at, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      groupId,
      body.bankId,
      user.id,
      body.targetScore ?? null,
      body.dueAt ?? null,
      body.notes ? body.notes.trim() : null,
      now,
    )
    .run();

  return Response.json({ id }, { status: 201 });
}

/** `DELETE /api/groups/:id/assignments/:assignmentId`: remove an assigned bank from a group. */
export async function deleteGroupAssignment(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const groupId = decodeURIComponent(context.params[0] ?? "");
  const assignmentId = decodeURIComponent(context.params[1] ?? "");
  const group = await groupFor(context.env, groupId, user.id);

  const assignment = await context.env.DB.prepare(
    "SELECT id, group_id, assigned_by FROM group_bank_assignments WHERE id = ? AND group_id = ?",
  )
    .bind(assignmentId, groupId)
    .first<{ id: string; group_id: string; assigned_by: string }>();

  if (!assignment) {
    throw new HttpError(404, "assignment_not_found", "Assignment not found.");
  }

  if (assignment.assigned_by !== user.id && group.owner_id !== user.id) {
    throw new HttpError(
      403,
      "forbidden",
      "Only the tutor or group owner can remove this assignment.",
    );
  }

  await context.env.DB.prepare("DELETE FROM group_bank_assignments WHERE id = ?")
    .bind(assignmentId)
    .run();

  return Response.json({ ok: true });
}

/** `POST /api/groups/:id/assignments/:assignmentId/complete`: record a member's practice completion. */
export async function completeGroupAssignment(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const groupId = decodeURIComponent(context.params[0] ?? "");
  const assignmentId = decodeURIComponent(context.params[1] ?? "");
  await groupFor(context.env, groupId, user.id);

  const body = await readJson(context.request, completeAssignmentSchema);

  const assignment = await context.env.DB.prepare(
    "SELECT id, bank_id FROM group_bank_assignments WHERE id = ? AND group_id = ?",
  )
    .bind(assignmentId, groupId)
    .first<{ id: string; bank_id: string }>();

  if (!assignment) {
    throw new HttpError(404, "assignment_not_found", "Assignment not found.");
  }

  const accuracyPercent = Math.min(
    100,
    Math.round((body.score / Math.max(1, body.totalQuestions)) * 100),
  );
  const now = Date.now();

  await context.env.DB.prepare(
    `INSERT INTO group_assignment_completions
       (assignment_id, user_id, score, total_questions, accuracy_percent, attempts_count, completed_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(assignment_id, user_id) DO UPDATE SET
       score = MAX(group_assignment_completions.score, excluded.score),
       total_questions = excluded.total_questions,
       accuracy_percent = MAX(group_assignment_completions.accuracy_percent, excluded.accuracy_percent),
       attempts_count = group_assignment_completions.attempts_count + 1,
       completed_at = excluded.completed_at`,
  )
    .bind(assignmentId, user.id, body.score, body.totalQuestions, accuracyPercent, now)
    .run();

  const completionRow = await context.env.DB.prepare(
    `SELECT score, total_questions, accuracy_percent, attempts_count, completed_at
       FROM group_assignment_completions
      WHERE assignment_id = ? AND user_id = ?`,
  )
    .bind(assignmentId, user.id)
    .first<CompletionRow>();

  const completion: AssignmentCompletion = {
    score: completionRow?.score ?? body.score,
    totalQuestions: completionRow?.total_questions ?? body.totalQuestions,
    accuracyPercent: completionRow?.accuracy_percent ?? accuracyPercent,
    attemptsCount: completionRow?.attempts_count ?? 1,
    completedAt: completionRow?.completed_at ?? now,
  };

  return Response.json({ ok: true, completion });
}
