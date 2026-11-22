import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { account, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { toAuthErrorMessage } from "@/lib/auth-errors";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";

afterAll(() => closeDb());

const email = "auth-test@example.com";
const password = "kata-sandi-test-123";

// Returns the thrown error so the test can check its Indonesian message.
async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Seharusnya gagal, tapi berhasil");
}

describe("validasi form", () => {
  it("menolak email dan kata sandi yang tidak valid", () => {
    const result = signUpSchema.safeParse({ name: "", email: "bukan-email", password: "pendek" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      "Nama wajib diisi",
      "Format email belum benar",
      "Kata sandi minimal 8 karakter",
    ]);
  });

  it("merapikan spasi di email", () => {
    expect(signInSchema.parse({ email: "  a@b.co ", password: "x" }).email).toBe("a@b.co");
  });
});

describe("daftar dan masuk lewat Better Auth", () => {
  it("membuat pengguna dan menyimpan kata sandi dalam bentuk hash", async () => {
    const result = await auth.api.signUpEmail({ body: { name: "Tes", email, password } });
    expect(result.user.email).toBe(email);

    const [row] = await db.select({ password: account.password }).from(account).where(eq(account.userId, result.user.id));
    expect(row?.password).toBeTruthy();
    expect(row?.password).not.toContain(password);
  });

  it("menolak email yang sudah terdaftar", async () => {
    const error = await caught(auth.api.signUpEmail({ body: { name: "Tes", email, password } }));
    expect(toAuthErrorMessage(error)).toBe("Email ini sudah terdaftar. Coba masuk.");
    expect(await db.$count(user, eq(user.email, email))).toBe(1);
  });

  it("menolak kata sandi yang salah", async () => {
    const error = await caught(auth.api.signInEmail({ body: { email, password: "salah-salah-salah" } }));
    expect(toAuthErrorMessage(error)).toBe("Email atau kata sandi salah.");
  });

  it("menerima kata sandi yang benar", async () => {
    const result = await auth.api.signInEmail({ body: { email, password } });
    expect(result.user.email).toBe(email);
  });

  it("endpoint HTTP masuk dan daftar ditutup (hanya lewat Server Action yang dibatasi)", async () => {
    for (const path of ["sign-in/email", "sign-up/email"]) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ email, password, name: "Tes" }),
        }),
      );
      expect(response.status).toBe(404);
    }
  });

  it("pesan cadangan untuk error yang tidak dikenal", () => {
    expect(toAuthErrorMessage(new Error("boom"))).toBe("Ada yang salah di server. Coba lagi sebentar lagi.");
  });
});
