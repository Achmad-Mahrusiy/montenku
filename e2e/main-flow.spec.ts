import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

// The main flow from the brief (D-038): sign up -> content accounts -> recurring schedule -> calendar per account and
// combined -> content item with a reminder. Plus isolation: another user cannot open it by URL.
// Fixed far-future dates for content, so nothing depends on the day the test runs (CI runs in UTC, any day).

const sql = postgres("postgresql://postgres:postgres@localhost:55434/postgres", { max: 1 });
test.afterAll(() => sql.end());

const run = Date.now().toString(36);
const password = "kata-sandi-e2e-123";

async function signUp(page: Page, name: string, email: string) {
  await page.goto("/daftar");
  await page.getByLabel("Nama").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page).toHaveURL("/");
}

async function addContentAccount(page: Page, name: string, timezone: string) {
  await page.goto("/akun-konten?tambah=1");
  await page.getByLabel("Nama akun").fill(name);
  await page.getByPlaceholder("@namaakun").fill(name.toLowerCase().replace(/\W/g, ""));
  await page.getByLabel("Zona waktu").selectOption(timezone);
  await page.getByRole("button", { name: "Tambah akun" }).click();
  await expect(page.getByRole("list", { name: "Daftar akun konten" })).toContainText(name);
}

/** The id of an <option> found by its visible text (the labels include a timezone suffix). */
async function optionValue(page: Page, selectId: string, text: string) {
  return (await page.locator(`#${selectId} option`, { hasText: text }).getAttribute("value")) ?? "";
}

test("alur utama: daftar, akun konten, jadwal berulang, kalender per akun dan gabungan, konten dengan pengingat", async ({ page }) => {
  const email = `e2e-${run}@example.test`;
  const masak = `Masak ${run}`;
  const jalan = `Jalan ${run}`;

  await signUp(page, "Uji E2E", email);
  // The app really uses the throwaway database: a broken env override would have put this user somewhere else.
  const [row] = await sql`select id from "user" where email = ${email}`;
  expect(row).toBeTruthy();

  await addContentAccount(page, masak, "Asia/Jakarta");
  await addContentAccount(page, jalan, "Asia/Tokyo");

  // A schedule on every weekday from today, so this month always has an empty slot whatever the date.
  await page.goto("/jadwal?baru=1");
  await page.locator("#accountId").selectOption(await optionValue(page, "accountId", masak));
  await page.getByLabel("Nama jadwal").fill("Upload harian");
  for (const day of ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]) {
    // By role: the label's text also holds the short day name ("Sen"), which is hidden from screen readers.
    await page.getByRole("checkbox", { name: day, exact: true }).check({ force: true });
  }
  await page.getByLabel("Jam", { exact: true }).fill("08:00");
  await page.getByRole("button", { name: "Buat jadwal" }).click();
  await expect(page).toHaveURL(/\/jadwal\?ubah=/);

  // Combined calendar shows the slot; filtered to the other account it does not.
  await page.goto("/kalender?tampilan=daftar");
  await expect(page.getByRole("link", { name: /Slot kosong/ }).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Filter akun konten" }).getByRole("link", { name: jalan }).click();
  await expect(page.getByRole("link", { name: /Slot kosong/ })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Filter akun konten" }).getByRole("link", { name: masak }).click();
  await expect(page.getByRole("link", { name: /Slot kosong/ }).first()).toBeVisible();

  // A content item on the Tokyo account, then a reminder on it.
  await page.goto("/konten/baru");
  await page.getByLabel("Judul").fill("Jalan-jalan Shibuya");
  await page.locator("#accountId").selectOption(await optionValue(page, "accountId", jalan));
  await page.getByLabel("Tanggal target").fill("2031-03-07");
  await page.getByLabel("Jam target").fill("19:00");
  await page.getByRole("button", { name: "Simpan konten" }).click();
  await expect(page).toHaveURL(/\/konten\/[0-9a-f-]{36}$/);

  await page.getByLabel("Tambah pengingat").selectOption({ label: "2 jam sebelum" });
  await page.getByRole("button", { name: "Tambah", exact: true }).click();
  const reminders = page.getByRole("region", { name: "Pengingat", exact: true });
  await expect(reminders).toContainText("2 jam sebelum");
  // 19:00 Tokyo minus 2 hours, shown in the account's own zone.
  await expect(reminders).toContainText("17:00");

  // In the calendar for that month: shown for "Semua akun" and for its own account, hidden for the other.
  await page.goto("/kalender?tampilan=daftar&tanggal=2031-03-07");
  await expect(page.getByRole("link", { name: /Jalan-jalan Shibuya/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Filter akun konten" }).getByRole("link", { name: masak }).click();
  await expect(page.getByRole("link", { name: /Jalan-jalan Shibuya/ })).toHaveCount(0);
});

test("isolasi: pengguna lain tidak bisa membuka konten atau akun konten orang lain lewat URL", async ({ page, browser }) => {
  await signUp(page, "Pemilik", `e2e-a-${run}@example.test`);
  await addContentAccount(page, `Rahasia ${run}`, "Asia/Jakarta");
  const accountHref = await page.getByRole("link", { name: `Ubah Rahasia ${run}` }).getAttribute("href");
  await page.goto("/konten/baru");
  await page.getByLabel("Judul").fill("Konten rahasia");
  await page.getByLabel("Tanggal target").fill("2031-03-07");
  await page.getByLabel("Jam target").fill("19:00");
  await page.getByRole("button", { name: "Simpan konten" }).click();
  await expect(page).toHaveURL(/\/konten\/[0-9a-f-]{36}$/);
  const itemUrl = new URL(page.url()).pathname;

  // A second user in a separate browser context (own cookies).
  const other = await browser.newContext();
  const intruder = await other.newPage();
  await signUp(intruder, "Penyusup", `e2e-b-${run}@example.test`);

  await intruder.goto(itemUrl);
  await expect(intruder.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
  await expect(intruder.getByText("Konten rahasia")).toHaveCount(0);

  await intruder.goto(accountHref ?? "/akun-konten");
  await expect(intruder.getByText("Akun konten tidak ditemukan")).toBeVisible();
  await expect(intruder.getByText(`Rahasia ${run}`)).toHaveCount(0);
  await other.close();
});
