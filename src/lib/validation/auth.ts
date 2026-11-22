import { z } from "zod";

const email = z.string().trim().pipe(z.email("Format email belum benar"));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Kata sandi wajib diisi").max(128, "Kata sandi maksimal 128 karakter"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(100, "Nama maksimal 100 karakter"),
  email,
  // Same limits as Better Auth's defaults (8 to 128), so the form catches it before the server does.
  password: z.string().min(8, "Kata sandi minimal 8 karakter").max(128, "Kata sandi maksimal 128 karakter"),
});
