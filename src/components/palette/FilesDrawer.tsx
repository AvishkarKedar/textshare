"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Files as FilesIcon,
  Upload,
  Download,
  Trash2,
  FileText,
  FileCode,
  FileImage,
  File as FileGeneric,
  Loader2,
  Eye,
} from "lucide-react";
import { useAnon, type SharedFile } from "@/lib/store";
import { uploadSharedFile, downloadSharedFile, deleteSharedFile, FILE_LIMITS, getSession } from "@/lib/session";
import { toast } from "sonner";

function isTextFile(type: string, name: string): boolean {
  if (type.startsWith("text/")) return true;
  if (/\.(txt|md|js|ts|tsx|jsx|py|c|cpp|rs|go|java|rb|php|sh|json|yaml|yml|toml|csv|html|css|xml|log)$/i.test(name)) return true;
  return false;
}

function fileIcon(type: string, name: string) {
  if (type.startsWith("image/")) return FileImage;
  if (/\.(js|ts|tsx|jsx|py|c|cpp|rs|go|java|rb|php|sh)$/.test(name)) return FileCode;
  if (/\.(md|txt|json|yaml|yml|toml|csv)$/.test(name)) return FileText;
  return FileGeneric;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

export function FilesDrawer() {
  const s = useAnon();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewing, setPreviewing] = useState<SharedFile | null>(null);
  const [previewText, setPreviewText] = useState<string>("");
  const [previewIsImage, setPreviewIsImage] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!s.filesOpen) return null;

  const inRoom = getSession() !== null;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!inRoom) {
      toast.error("Join a room first", { description: "Encrypted file sharing syncs through the room relay." });
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        await uploadSharedFile(file, (p) => setProgress(p));
      }
      toast.success(`${files.length} file${files.length > 1 ? "s" : ""} encrypted & uploaded`, {
        description: `AES-GCM-256 · ${FILE_LIMITS.CHUNK_SIZE / 1024}KB chunks · the relay stores ciphertext only`,
      });
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function fetchBlob(f: SharedFile): Promise<Blob> {
    if (f.dataUrl) {
      const res = await fetch(f.dataUrl);
      return res.blob();
    }
    setBusyId(f.id);
    try {
      return await downloadSharedFile(f.id);
    } finally {
      setBusyId(null);
    }
  }

  async function download(f: SharedFile) {
    try {
      const blob = await fetchBlob(f);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success(`Decrypted · downloading ${f.name}`);
    } catch (err) {
      toast.error("Download failed", { description: err instanceof Error ? err.message : String(err) });
    }
  }

  async function openPreview(f: SharedFile) {
    try {
      const blob = await fetchBlob(f);
      if (f.type.startsWith("image/")) {
        const url = URL.createObjectURL(blob);
        setPreviewing({ ...f, dataUrl: url });
        setPreviewIsImage(true);
        setPreviewText("");
      } else {
        const text = await blob.slice(0, 50_000).text();
        setPreviewing(f);
        setPreviewIsImage(false);
        setPreviewText(text);
      }
    } catch (err) {
      toast.error("Preview failed", { description: err instanceof Error ? err.message : String(err) });
    }
  }

  async function remove(f: SharedFile) {
    try {
      await deleteSharedFile(f.id);
      toast.success("File removed for everyone");
    } catch (err) {
      toast.error("Remove failed", { description: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        onClick={() => s.toggleFiles()}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-md flex-col bg-[var(--anon-panel)] hairline-l shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <FilesIcon className="h-4 w-4 anon-accent" /> Files
              {s.sharedFiles.length > 0 && (
                <span className="anon-mono text-[10px] anon-dim">· {s.sharedFiles.length}</span>
              )}
            </h2>
            <button onClick={() => s.toggleFiles()} className="anon-mut hover:anon-fg">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`m-3 flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-6 transition-colors ${
              dragging ? "border-[var(--anon-accent)] bg-[var(--anon-raise)]" : "border-[var(--anon-line2)] hover:bg-[var(--anon-raise)]"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin anon-accent" />
                <span className="anon-mono text-xs anon-mut">encrypting + uploading… {progress}%</span>
                <div className="h-1 w-40 hairline overflow-hidden bg-[var(--anon-raise)]">
                  <div className="h-full bg-[var(--anon-accent)] transition-all" style={{ width: `${progress}%` }} />
                </div>
              </>
            ) : (
              <>
                <Upload className={`h-6 w-6 ${dragging ? "anon-accent" : "anon-mut"}`} />
                <span className="anon-mono text-xs anon-fg">
                  {dragging ? "drop to upload" : "drop files here or click to browse"}
                </span>
                <span className="anon-mono text-[10px] anon-dim">max 10 files · 25MB each · AES-GCM-256, zero-knowledge relay</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {/* file list */}
          <div className="anon-scroll flex-1 overflow-y-auto px-3 pb-3">
            {s.sharedFiles.length === 0 && (
              <div className="anon-mono py-8 text-center text-xs anon-mut">
                no files shared yet — drop one above
              </div>
            )}
            {s.sharedFiles.map((f) => {
              const Icon = fileIcon(f.type, f.name);
              return (
                <div key={f.id} className="mb-2 hairline bg-[var(--anon-bg)] p-3 group">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 flex-none items-center justify-center hairline">
                      <Icon className="h-4 w-4 anon-accent" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="anon-mono truncate text-xs anon-fg">{f.name}</div>
                      <div className="anon-mono text-[10px] anon-dim flex items-center gap-1.5">
                        {formatSize(f.size)}
                        <span>·</span>
                        <span style={{ color: f.uploaderColor }}>{f.uploader}</span>
                        <span>·</span>
                        <span>{new Date(f.uploadedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-1">
                      {busyId === f.id ? (
                        <Loader2 className="h-4 w-4 animate-spin anon-accent" />
                      ) : (
                        <>
                          {(isTextFile(f.type, f.name) || f.type.startsWith("image/")) && (
                            <button
                              onClick={() => void openPreview(f)}
                              className="anon-mono inline-flex h-7 w-7 items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                              title="Decrypt + preview content"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => void download(f)}
                            className="anon-mono inline-flex h-7 w-7 items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                            title="Decrypt + download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => void remove(f)}
                            className="anon-mono inline-flex h-7 w-7 items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)]"
                            style={{ color: "var(--anon-danger)" }}
                            title="Remove for everyone"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* image thumbnail (local cache after preview) */}
                  {f.type.startsWith("image/") && f.dataUrl && (
                    <div className="mt-2 hairline">
                      <img src={f.dataUrl} alt={f.name} className="max-h-32 w-full object-cover" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>AES-GCM-256 in-browser · {FILE_LIMITS.CHUNK_SIZE / 1024}KB chunks · relay stores ciphertext only</span>
            <span>{s.sharedFiles.length} file{s.sharedFiles.length === 1 ? "" : "s"}</span>
          </div>

          {/* file content preview modal */}
          <AnimatePresence>
            {previewing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                onClick={() => setPreviewing(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 8 }}
                  transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex max-h-[80vh] w-full max-w-3xl flex-col hairline anon-panel shadow-2xl shadow-black/60"
                >
                  <div className="flex h-10 items-center justify-between hairline-b px-4">
                    <h3 className="anon-mono inline-flex items-center gap-2 text-xs anon-fg">
                      <Eye className="h-3.5 w-3.5 anon-accent" /> {previewing.name}
                      <span className="anon-dim">· {formatSize(previewing.size)}</span>
                    </h3>
                    <button onClick={() => setPreviewing(null)} className="anon-mut hover:anon-fg">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {previewIsImage ? (
                    <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--anon-bg)] p-4">
                      {previewing.dataUrl ? (
                        <img src={previewing.dataUrl} alt={previewing.name} className="max-h-[70vh] max-w-full object-contain" />
                      ) : (
                        <Loader2 className="h-6 w-6 animate-spin anon-accent" />
                      )}
                    </div>
                  ) : (
                    <pre className="anon-mono anon-scroll flex-1 overflow-auto bg-[var(--anon-bg)] p-4 text-[11px] leading-snug anon-fg">
                      {previewText || "(decrypting…)"}
                    </pre>
                  )}
                  <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
                    <span>{previewing.type || "text/plain"} · uploaded by {previewing.uploader}</span>
                    <span>{previewText.length} chars</span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
