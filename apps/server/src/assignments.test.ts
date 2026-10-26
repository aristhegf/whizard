import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { forgetSettings } from "./settings";
import { createSession } from "./sessions";
import { addUser, testDb } from "./testDb";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
const app = (await import("./index")).default;

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

async function call(
  env: Env,
  path: string,
  init?: { method?: string; headers?: Record<string, string>; body?: BodyInit },
): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init), env, ctx);
}

async function playerEnv(id: string): Promise<{ env: Env; headers: Record<string, string> }> {
  const env = { DB: await testDb() } as unknown as Env;
  await addUser(env.DB, id);
  const cookie = (await createSession(env, id, Date.now())).split(";")[0]!;
  return { env, headers: { Cookie: cookie, Origin: "http://localhost" } };
}

const jsonBody = (headers: Record<string, string>, body: unknown) => ({
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function makeBank(
  env: Env,
  headers: Record<string, string>,
  name = "Calculus 101",
  isPublic = false,
): Promise<string> {
  const res = await call(env, "/api/banks", {
    method: "POST",
    ...jsonBody(headers, { name, exam: "JAMB", subject: "Maths", isPublic }),
  });
  const data = (await res.json()) as { bank: { id: string } };

  await call(env, `/api/banks/${data.bank.id}/questions`, {
    method: "POST",
    ...jsonBody(headers, {
      prompt: "What is the derivative of x^2?",
      choices: ["2x", "x", "x^2", "2"],
      explanation: "Power rule: d/dx(x^n) = n*x^(n-1)",
      reference: null,
    }),
  });

  return data.bank.id;
}

async function makeGroup(
  env: Env,
  headers: Record<string, string>,
  name = "Study Squad",
): Promise<string> {
  const res = await call(env, "/api/groups", {
    method: "POST",
    ...jsonBody(headers, { name, members: [] }),
  });
  const data = (await res.json()) as { id: string };
  return data.id;
}

describe("Study Group Assignments & Links", () => {
  beforeEach(() => {
    forgetSettings();
  });

  it("fetches group details and membership status via GET /api/groups/:id", async () => {
    const { env, headers: tutorHeaders } = await playerEnv("tutor_1");
    const groupId = await makeGroup(env, tutorHeaders, "JAMB Prep Group");

    // Tutor checking their own group
    const tutorRes = await call(env, `/api/groups/${groupId}`, { headers: tutorHeaders });
    expect(tutorRes.status).toBe(200);
    const tutorData = (await tutorRes.json()) as any;
    expect(tutorData.group.name).toBe("JAMB Prep Group");
    expect(tutorData.group.owner).toBe("tutor_1");
    expect(tutorData.isMember).toBe(true);
    expect(tutorData.group.members).toHaveLength(1);

    // Another player checking the group before joining
    await addUser(env.DB, "student_1");
    const cookie = (await createSession(env, "student_1", Date.now())).split(";")[0]!;
    const studentHeaders = { Cookie: cookie, Origin: "http://localhost" };

    const studentRes = await call(env, `/api/groups/${groupId}`, { headers: studentHeaders });
    expect(studentRes.status).toBe(200);
    const studentData = (await studentRes.json()) as any;
    expect(studentData.isMember).toBe(false);

    // Non-existent group
    const missingRes = await call(env, "/api/groups/grp_unknown", { headers: studentHeaders });
    expect(missingRes.status).toBe(404);
  });

  it("allows a student to join a group via POST /api/groups/:id/join", async () => {
    const { env, headers: tutorHeaders } = await playerEnv("tutor_2");
    const groupId = await makeGroup(env, tutorHeaders, "Chemistry Cohort");

    await addUser(env.DB, "student_2");
    const cookie = (await createSession(env, "student_2", Date.now())).split(";")[0]!;
    const studentHeaders = { Cookie: cookie, Origin: "http://localhost" };

    const joinRes = await call(env, `/api/groups/${groupId}/join`, {
      method: "POST",
      headers: studentHeaders,
    });
    expect(joinRes.status).toBe(201);
    const joinData = (await joinRes.json()) as any;
    expect(joinData.joined).toBe(true);

    // Verify membership now
    const checkRes = await call(env, `/api/groups/${groupId}`, { headers: studentHeaders });
    const checkData = (await checkRes.json()) as any;
    expect(checkData.isMember).toBe(true);
    expect(checkData.group.members).toHaveLength(2);

    // Joining again is idempotent
    const reJoinRes = await call(env, `/api/groups/${groupId}/join`, {
      method: "POST",
      headers: studentHeaders,
    });
    expect(reJoinRes.status).toBe(200);
    const reJoinData = (await reJoinRes.json()) as any;
    expect(reJoinData.joined).toBe(false);
  });

  it("handles assignment creation, permissions, and duplicate prevention", async () => {
    const { env, headers: tutorHeaders } = await playerEnv("tutor_3");
    const groupId = await makeGroup(env, tutorHeaders, "Physics Study Circle");
    const myBankId = await makeBank(env, tutorHeaders, "Mechanics Bank");

    // Assigning own bank
    const assignRes = await call(env, `/api/groups/${groupId}/assignments`, {
      method: "POST",
      ...jsonBody(tutorHeaders, {
        bankId: myBankId,
        targetScore: 80,
        dueAt: Date.now() + 86400000,
        notes: "Complete before Friday's tutorial session.",
      }),
    });
    expect(assignRes.status).toBe(201);
    const assignData = (await assignRes.json()) as any;
    expect(assignData.id).toMatch(/^asgn_/);

    // Duplicate assignment rejected
    const dupRes = await call(env, `/api/groups/${groupId}/assignments`, {
      method: "POST",
      ...jsonBody(tutorHeaders, { bankId: myBankId }),
    });
    expect(dupRes.status).toBe(400);

    // Creating another user's private bank
    await addUser(env.DB, "other_author");
    const otherCookie = (await createSession(env, "other_author", Date.now())).split(";")[0]!;
    const otherHeaders = { Cookie: otherCookie, Origin: "http://localhost" };
    const privateBankId = await makeBank(env, otherHeaders, "Private Vault", false);

    const forbiddenRes = await call(env, `/api/groups/${groupId}/assignments`, {
      method: "POST",
      ...jsonBody(tutorHeaders, { bankId: privateBankId }),
    });
    expect(forbiddenRes.status).toBe(403);

    // Creating another user's PUBLIC bank is allowed
    const publicBankId = await makeBank(env, otherHeaders, "Public WAEC Bank", true);
    const publicAssignRes = await call(env, `/api/groups/${groupId}/assignments`, {
      method: "POST",
      ...jsonBody(tutorHeaders, { bankId: publicBankId }),
    });
    expect(publicAssignRes.status).toBe(201);
  });

  it("lists assignments, tracks member completion, and updates leaderboards", async () => {
    const { env, headers: tutorHeaders } = await playerEnv("tutor_4");
    const groupId = await makeGroup(env, tutorHeaders, "Biology Exam Prep");
    const bankId = await makeBank(env, tutorHeaders, "Genetics Review");

    const assignRes = await call(env, `/api/groups/${groupId}/assignments`, {
      method: "POST",
      ...jsonBody(tutorHeaders, {
        bankId,
        targetScore: 75,
        notes: "Aim for at least 75%",
      }),
    });
    const { id: assignmentId } = (await assignRes.json()) as { id: string };

    // Add student to group
    await addUser(env.DB, "student_4");
    const cookie = (await createSession(env, "student_4", Date.now())).split(";")[0]!;
    const studentHeaders = { Cookie: cookie, Origin: "http://localhost" };
    await call(env, `/api/groups/${groupId}/join`, { method: "POST", headers: studentHeaders });

    // Student fetches assignments before practicing
    const listBeforeRes = await call(env, `/api/groups/${groupId}/assignments`, {
      headers: studentHeaders,
    });
    expect(listBeforeRes.status).toBe(200);
    const listBeforeData = (await listBeforeRes.json()) as any;
    expect(listBeforeData.assignments).toHaveLength(1);
    expect(listBeforeData.assignments[0].bankName).toBe("Genetics Review");
    expect(listBeforeData.assignments[0].targetScore).toBe(75);
    expect(listBeforeData.assignments[0].myCompletion).toBeNull();
    expect(listBeforeData.assignments[0].completions).toHaveLength(0);

    // Student completes the assignment: 15 / 20 correct (75%)
    const completeRes = await call(
      env,
      `/api/groups/${groupId}/assignments/${assignmentId}/complete`,
      {
        method: "POST",
        ...jsonBody(studentHeaders, { score: 15, totalQuestions: 20 }),
      },
    );
    expect(completeRes.status).toBe(200);
    const completeData = (await completeRes.json()) as any;
    expect(completeData.ok).toBe(true);
    expect(completeData.completion.accuracyPercent).toBe(75);
    expect(completeData.completion.attemptsCount).toBe(1);

    // Student improves their score: 19 / 20 correct (95%)
    const retryRes = await call(
      env,
      `/api/groups/${groupId}/assignments/${assignmentId}/complete`,
      {
        method: "POST",
        ...jsonBody(studentHeaders, { score: 19, totalQuestions: 20 }),
      },
    );
    expect(retryRes.status).toBe(200);
    const retryData = (await retryRes.json()) as any;
    expect(retryData.completion.score).toBe(19);
    expect(retryData.completion.accuracyPercent).toBe(95);
    expect(retryData.completion.attemptsCount).toBe(2);

    // Tutor inspects the assignment leaderboard
    const tutorCheckRes = await call(env, `/api/groups/${groupId}/assignments`, {
      headers: tutorHeaders,
    });
    const tutorCheckData = (await tutorCheckRes.json()) as any;
    const assignment = tutorCheckData.assignments[0];
    expect(assignment.completions).toHaveLength(1);
    expect(assignment.completions[0].user.username).toBe("student_4");
    expect(assignment.completions[0].score).toBe(19);
    expect(assignment.completions[0].accuracyPercent).toBe(95);
    expect(assignment.completions[0].attemptsCount).toBe(2);

    // Deleting assignment
    const delRes = await call(env, `/api/groups/${groupId}/assignments/${assignmentId}`, {
      method: "DELETE",
      headers: tutorHeaders,
    });
    expect(delRes.status).toBe(200);

    const afterDelRes = await call(env, `/api/groups/${groupId}/assignments`, {
      headers: tutorHeaders,
    });
    const afterDelData = (await afterDelRes.json()) as any;
    expect(afterDelData.assignments).toHaveLength(0);
  });
});
