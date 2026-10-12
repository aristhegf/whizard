import type { PlayerBank, PlayerBankDetail, PlayerBankQuestion } from "@whizard/protocol";
import { api } from "./account";

/** The signed-in player's question banks, most recently touched first. */
export const fetchBanks = async (): Promise<PlayerBank[]> =>
  (await api<{ banks: PlayerBank[] }>("/api/banks")).banks;

/** One bank with its questions, or a 404 if it isn't theirs. */
export const fetchBank = async (id: string): Promise<PlayerBankDetail> =>
  (await api<{ bank: PlayerBankDetail }>(`/api/banks/${encodeURIComponent(id)}`)).bank;

export const createBank = async (input: {
  name: string;
  exam?: string | null;
  subject?: string | null;
}): Promise<PlayerBank> =>
  (await api<{ bank: PlayerBank }>("/api/banks", { method: "POST", body: input })).bank;

export const updateBank = async (
  id: string,
  input: { name?: string; exam?: string | null; subject?: string | null },
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
