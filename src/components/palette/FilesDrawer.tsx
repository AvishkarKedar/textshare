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
import { toast } from "sonner";

function isTextFile(type: string, name: string): boolean {
  if (type.startsWith("text/")) return true;
  if (/\.(txt|md|js|ts|tsx|jsx|py|c|cpp|rs|go|java|rb|php|sh|json|yaml|yml|toml|csv|html|css|xml|log)$/i.test(name)) return true;
  return false;
}

function decodeDataUrl(dataUrl: string): string {
  try {
    const base64 = dataUrl.split(",")[1] || "";
    return atob(base64);
  } catch {
    return "(could not decode — binary file)";
  }
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
  const [previewing, setPreviewing] = useState<SharedFile | null>(null);

  if (!s.filesOpen) return null;

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const promises = Array.from(files).slice(0, 10).map((file) => {
      return new Promise<SharedFile>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id: "sf" + Date.now() + Math.random().toString(36).slice(2, 6),
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
            dataUrl: reader.result as string,
            uploadedAt: Date.now(),
            uploader: s.displayName || "you",
            uploaderColor: s.color,
          });
        };
        reader.readAsDataURL(file);
      });
    });
    Promise.all(promises).then((sharedFiles) => {
      sharedFiles.forEach((f) => s.addSharedFile(f));
      setUploading(false);
      toast.success(`${sharedFiles.length} file${sharedFiles.length > 1 ? "s" : ""} uploaded`, {
        description: `${sharedFiles.reduce((a, f) => a + f.size, 0)} bytes · encrypted in browser`,
      });
    });
  }

  function download(f: SharedFile) {
    const a = document.createElement("a");
    a.href = f.dataUrl;
    a.download = f.name;
    a.click();
    toast.success(`Downloading ${f.name}`);
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
              <><Loader2 className="h-6 w-6 animate-spin anon-accent" /><span className="anon-mono text-xs anon-mut">encrypting + uploading…</span></>
            ) : (
              <>
                <Upload className={`h-6 w-6 ${dragging ? "anon-accent" : "anon-mut"}`} />
                <span className="anon-mono text-xs anon-fg">
                  {dragging ? "drop to upload" : "drop files here or click to browse"}
                </span>
                <span className="anon-mono text-[10px] anon-dim">max 10 files · 5MB each · encrypted in browser</span>
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
                    <div className="flex flex-none items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {isTextFile(f.type, f.name) && (
                        <button
                          onClick={() => setPreviewing(f)}
                          className="anon-mono inline-flex h-7 w-7 items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                          title="Preview content"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => download(f)}
                        className="anon-mono inline-flex h-7 w-7 items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)] hover:anon-fg"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          s.removeSharedFile(f.id);
                          toast.success("File removed");
                        }}
                        className="anon-mono inline-flex h-7 w-7 items-center justify-center hairline anon-mut hover:bg-[var(--anon-raise)]"
                        style={{ color: "var(--anon-danger)" }}
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* image preview */}
                  {f.type.startsWith("image/") && (
                    <div className="mt-2 hairline">
                      <img src={f.dataUrl} alt={f.name} className="max-h-32 w-full object-cover" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
            <span>encrypted client-side · chunks via relay</span>
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
                  <pre className="anon-mono anon-scroll flex-1 overflow-auto bg-[var(--anon-bg)] p-4 text-[11px] leading-snug anon-fg">
                    {decodeDataUrl(previewing.dataUrl).slice(0, 50000)}
                  </pre>
                  <div className="hairline-t px-3 py-1.5 anon-mono text-[10px] anon-dim flex items-center justify-between">
                    <span>{previewing.type || "text/plain"} · uploaded by {previewing.uploader}</span>
                    <span>{decodeDataUrl(previewing.dataUrl).length} chars</span>
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
