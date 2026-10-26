import type {
  BankImportPatch,
  PlayerBank,
  PlayerBankDetail,
  PlayerBankImport,
  PlayerBankQuestion,
} from "@whizard/protocol";
import { api } from "./account";

/** The signed-in player's question banks, most recently touched first. */
export const fetchBanks = async (): Promise<PlayerBank[]> =>
  (await api<{ banks: PlayerBank[] }>("/api/banks")).banks;

/** Public community question banks, discoverable by all players. */
export const fetchPublicBanks = async (params?: {
  search?: string;
  exam?: string;
  subject?: string;
}): Promise<PlayerBank[]> => {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.exam) query.set("exam", params.exam);
  if (params?.subject) query.set("subject", params.subject);
  const qStr = query.toString();
  return (await api<{ banks: PlayerBank[] }>(`/api/banks/public${qStr ? `?${qStr}` : ""}`)).banks;
};

/** Clones a public bank into the signed-in player's personal collection. */
export const forkBank = async (id: string): Promise<PlayerBank> =>
  (
    await api<{ bank: PlayerBank }>(`/api/banks/${encodeURIComponent(id)}/fork`, {
      method: "POST",
    })
  ).bank;

/** One bank with its questions, or a 404 if it isn't theirs. */
export const fetchBank = async (id: string): Promise<PlayerBankDetail> =>
  (await api<{ bank: PlayerBankDetail }>(`/api/banks/${encodeURIComponent(id)}`)).bank;

export const createBank = async (input: {
  name: string;
  exam?: string | null;
  subject?: string | null;
  isPublic?: boolean;
}): Promise<PlayerBank> =>
  (await api<{ bank: PlayerBank }>("/api/banks", { method: "POST", body: input })).bank;

export const updateBank = async (
  id: string,
  input: { name?: string; exam?: string | null; subject?: string | null; isPublic?: boolean },
): Promise<PlayerBank> =>
  (
    await api<{ bank: PlayerBank }>(`/api/banks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    })
  ).bank;

export const deleteBank = async (id: string): Promise<void> => {
  await api<{ ok: true }>(`/api/banks/${encodeURIComponent(id)}`, { method: "DELETE" });
};

/** Deletes multiple questions from a bank in one request. */
export const bulkDeleteQuestions = async (bankId: string, questionIds: string[]): Promise<number> =>
  (
    await api<{ ok: true; deleted: number }>(
      `/api/banks/${encodeURIComponent(bankId)}/questions/bulk-delete`,
      { method: "POST", body: { questionIds } },
    )
  ).deleted;

/** Finds questions in this bank that also exist in other banks owned by this player. */
export const fetchBankDuplicates = async (
  bankId: string,
): Promise<{ questionId: string; prompt: string; otherBankId: string; otherBankName: string }[]> =>
  (
    await api<{
      duplicates: {
        questionId: string;
        prompt: string;
        otherBankId: string;
        otherBankName: string;
      }[];
    }>(`/api/banks/${encodeURIComponent(bankId)}/duplicates`)
  ).duplicates;

/** The body a question form sends: four choices, the first correct. */
export interface QuestionForm {
  prompt: string;
  choices: string[];
  explanation: string;
  reference: string | null;
}

export const addQuestion = async (
  bankId: string,
  input: QuestionForm,
): Promise<PlayerBankQuestion> =>
  (
    await api<{ question: PlayerBankQuestion }>(
      `/api/banks/${encodeURIComponent(bankId)}/questions`,
      { method: "POST", body: input },
    )
  ).question;

export const editQuestion = async (
  bankId: string,
  questionId: string,
  input: QuestionForm,
): Promise<PlayerBankQuestion> =>
  (
    await api<{ question: PlayerBankQuestion }>(
      `/api/banks/${encodeURIComponent(bankId)}/questions/${encodeURIComponent(questionId)}`,
      { method: "PATCH", body: input },
    )
  ).question;

export const deleteQuestion = async (bankId: string, questionId: string): Promise<void> => {
  await api<{ ok: true }>(
    `/api/banks/${encodeURIComponent(bankId)}/questions/${encodeURIComponent(questionId)}`,
    { method: "DELETE" },
  );
};

// CSV import and export -------------------------------------------------------------------------

/** Where the browser downloads a bank's own CSV, ready to re-import. */
export const bankExportHref = (bankId: string): string =>
  `/api/banks/${encodeURIComponent(bankId)}/export`;

/** Where the browser downloads all of the player's banks in one CSV. */
export const allBanksExportHref = "/api/banks/export";

/** The bank's unfinished import draft, or null when there's nothing to continue. */
export const fetchImportDraft = async (bankId: string): Promise<PlayerBankImport | null> =>
  (
    await api<{ import: PlayerBankImport | null }>(
      `/api/banks/${encodeURIComponent(bankId)}/imports`,
    )
  ).import;

/** Stages a CSV for review, replacing any draft this bank already had. */
export const startBankImport = async (bankId: string, csv: string): Promise<PlayerBankImport> =>
  (
    await api<{ import: PlayerBankImport }>(`/api/banks/${encodeURIComponent(bankId)}/imports`, {
      method: "POST",
      body: { csv },
    })
  ).import;

/** Asks the AI for the next batch of answers; the app loops until nothing is left. */
export const answerBankImport = async (
  bankId: string,
  importId: string,
): Promise<PlayerBankImport> =>
  (
    await api<{ import: PlayerBankImport }>(
      `/api/banks/${encodeURIComponent(bankId)}/imports/${encodeURIComponent(importId)}/answers`,
      { method: "POST" },
    )
  ).import;

/** Accepts the AI's flagged answers and/or sets answers on rows by hand. */
export const patchBankImport = async (
  bankId: string,
  importId: string,
  patch: BankImportPatch,
): Promise<PlayerBankImport> =>
  (
    await api<{ import: PlayerBankImport }>(
      `/api/banks/${encodeURIComponent(bankId)}/imports/${encodeURIComponent(importId)}/rows`,
      { method: "PATCH", body: patch },
    )
  ).import;

/** Puts the whole reviewed import into the bank, or nothing at all. */
export const commitBankImport = async (bankId: string, importId: string): Promise<number> =>
  (
    await api<{ added: number }>(
      `/api/banks/${encodeURIComponent(bankId)}/imports/${encodeURIComponent(importId)}/commit`,
      { method: "POST" },
    )
  ).added;

/** Throws the staged import away without touching the bank. */
export const discardBankImport = async (bankId: string, importId: string): Promise<void> => {
  await api<{ ok: true }>(
    `/api/banks/${encodeURIComponent(bankId)}/imports/${encodeURIComponent(importId)}`,
    { method: "DELETE" },
  );
};
