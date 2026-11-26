import { expect, test } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

test("tutor creates study group, assigns question bank, and invites student", async ({
  browser,
}) => {
  const tutorContext = await browser.newContext();
  const tutorPage = await tutorContext.newPage();
  await withPasskeys(tutorPage);

  const tutorUsername = uniqueUsername();
  await signUp(tutorPage, tutorUsername, "Prof Tutor");

  // 1. Tutor creates a question bank
  await tutorPage.goto("/banks?new=1");
  const uniqueBankTitle = `Mechanics ${Math.random().toString(36).slice(2, 8)}`;
  await tutorPage.getByLabel("Name").fill(uniqueBankTitle);
  await tutorPage.getByLabel("Exam").fill("JAMB");
  await tutorPage.getByLabel("Subject").fill("Physics");
  await tutorPage.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(tutorPage.getByRole("heading", { name: uniqueBankTitle, level: 1 })).toBeVisible();

  // Add one question so bank is playable
  await tutorPage.getByRole("button", { name: "Add a question" }).click();
  const field = (name: string) => tutorPage.getByRole("textbox", { name, exact: true });
  await field("Question").fill("What is the SI unit of Force?");
  await field("Correct answer").fill("Newton");
  await field("Wrong answer 1").fill("Joule");
  await field("Wrong answer 2").fill("Pascal");
  await field("Wrong answer 3").fill("Watt");
  await field("Explanation").fill("Force = mass * acceleration, unit is Newton.");
  await tutorPage.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(
    tutorPage.getByRole("link", { name: "What is the SI unit of Force?" }),
  ).toBeVisible();

  // 2. Tutor creates a study group
  await tutorPage.goto("/friends");
  await tutorPage.getByRole("button", { name: "New group" }).click();
  const groupName = `Physics Squad ${Math.random().toString(36).slice(2, 7)}`;
  await tutorPage.getByLabel("Group name").fill(groupName);
  await tutorPage.getByRole("button", { name: "Create group" }).click();

  // Group page opens
  await expect(tutorPage.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
  await expect(tutorPage.getByText(/Hosted by you/)).toBeVisible();

  // 3. Tutor assigns the question bank to this study group
  await tutorPage.getByRole("button", { name: "Assign question bank" }).click();
  await tutorPage.locator("#assign-bank").selectOption({ index: 1 });
  await tutorPage.getByLabel("Target score (%)").fill("85");
  await tutorPage
    .getByLabel("Tutor notes")
    .fill("Review Newton's laws thoroughly before the test.");
  await tutorPage.getByRole("button", { name: "Assign to group" }).click();

  // The assignment shows with its target and note
  await expect(tutorPage.getByRole("heading", { name: uniqueBankTitle })).toBeVisible();
  await expect(tutorPage.getByText("Target 85%")).toBeVisible();
  await expect(
    tutorPage.getByText("Review Newton's laws thoroughly before the test."),
  ).toBeVisible();
  const card = tutorPage.getByRole("article", { name: uniqueBankTitle });
  await expect(card.getByRole("button", { name: "Practise" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Timed exam" })).toBeVisible();

  // Visual verifications across desktop and mobile viewports
  await tutorPage.setViewportSize({ width: 1440, height: 900 });
  await tutorPage.screenshot({ path: "test-results/study-group-desktop-1440x900.png" });

  await tutorPage.setViewportSize({ width: 390, height: 844 });
  await tutorPage.screenshot({ path: "test-results/study-group-mobile-390x844.png" });

  await tutorPage.setViewportSize({ width: 375, height: 667 });
  await tutorPage.screenshot({ path: "test-results/study-group-short-375x667.png" });

  // Grab the current group URL to simulate student invite link
  const groupUrl = tutorPage.url();

  // 4. Student joins via invite link
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await withPasskeys(studentPage);

  const studentUsername = uniqueUsername();
  await signUp(studentPage, studentUsername, "Study Student");

  // Student navigates to group URL
  await studentPage.goto(groupUrl);
  await expect(studentPage.getByText("You’re invited to join this study group.")).toBeVisible();
  await expect(studentPage.getByText(`Created by @${tutorUsername}`)).toBeVisible();

  // Student clicks Join
  await studentPage.getByRole("button", { name: "Join group" }).click();

  // Student now sees the group and the assigned question bank!
  await expect(studentPage.getByRole("heading", { name: groupName, level: 1 })).toBeVisible();
  await expect(studentPage.getByText(uniqueBankTitle)).toBeVisible();
  await expect(studentPage.getByText("Target 85%")).toBeVisible();
  await expect(studentPage.getByText("Not done yet")).toBeVisible();
  await expect(
    studentPage
      .getByRole("article", { name: uniqueBankTitle })
      .getByRole("button", { name: "Practise" }),
  ).toBeVisible();

  await tutorContext.close();
  await studentContext.close();
});
