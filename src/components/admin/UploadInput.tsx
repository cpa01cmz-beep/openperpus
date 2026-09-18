"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "library-assets";
const MAX_SIZE = 10485760; // 10MB — matches supabase/migrations/0004_storage.sql
// S-sec-rls: svg REJECTED (stored-XSS vector) — keep jpeg/png/webp/gif/pdf only.
// Client-only check is bypassable; server guard lives in
// supabase/migrations/0007_storage_guard.sql (bucket mime list w/o svg).
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
// Folder allowlist (covers/banners/logo + articles/avatars/ebooks).
// Unknown folder falls back to "covers" so staff flow never breaks.
export const ALLOWED_FOLDERS = [
  "covers",
  "banners",
  "logo",
  "articles",
  "avatars",
  "ebooks",
] as const;

export type UploadInputProps = {
  value?: string;
  onUploaded: (url: string) => void;
  folder?: string;
  accept?: string;
  label?: string;
};

function sanitizeFolder(folder: string): string {
  return (ALLOWED_FOLDERS as readonly string[]).includes(folder) ? folder : "covers";
}

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url);
}

export default function UploadInput({
  value = "",
  onUploaded,
  folder = "covers",
  accept,
  label = "Upload",
}: UploadInputProps) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    if (file.size > MAX_SIZE) {
      setErr("Ukuran file maksimal 10MB.");
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      setErr(`Tipe file tidak didukung (${file.type || "unknown"}).`);
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${sanitizeFolder(folder)}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onUploaded(data.publicUrl);
    } catch (e) {
      setErr((e as Error).message || "Gagal mengunggah file.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm">
        {label}
        <input
          type="file"
          accept={accept ?? "image/jpeg,image/png,image/webp,image/gif,application/pdf"}
          onChange={onFile}
          disabled={uploading}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </label>
      {/* Manual URL paste fallback — keeps old behavior when storage unavailable */}
      <input
        type="text"
        value={value}
        onChange={(e) => onUploaded(e.target.value)}
        placeholder="https://… (atau pilih file di atas)"
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      {value && isImageUrl(value) && (
        <Image src={value} alt="pratinjau" width={80} height={80} unoptimized className="h-20 w-20 rounded-lg border object-cover" />
      )}
      {uploading && <p className="text-xs text-slate-500">Mengunggah…</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
