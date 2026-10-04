"use client";

/**
 * /learn — runnable starter files.
 *
 * Every card opens a real file in the editor; execution goes through the
 * same sandboxed runner as any other code (POST /api/run). Cards marked
 * "stdin" teach the input box in the terminal — the #1 confusion with
 * online compilers.
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BookOpen, ArrowDownToLine, Terminal } from "lucide-react";
import { toast } from "sonner";
import { useAnon } from "@/lib/store";

interface Starter {
  lang: string;
  file: string;
  note: string;
  stdin?: boolean;
  code: string;
}

const STARTERS: Starter[] = [
  {
    lang: "python",
    file: "hello-input.py",
    note: "reads your name from the input box",
    stdin: true,
    code: `name = input("what's your name? ")\nprint(f"hello, {name}!")\n`,
  },
  {
    lang: "python",
    file: "fizzbuzz.py",
    note: "the classic interview warm-up",
    code: `for n in range(1, 21):\n    if n % 15 == 0:\n        print("FizzBuzz")\n    elif n % 3 == 0:\n        print("Fizz")\n    elif n % 5 == 0:\n        print("Buzz")\n    else:\n        print(n)\n`,
  },
  {
    lang: "python",
    file: "primes.py",
    note: "sieve of Eratosthenes, prints the first 25 primes",
    code: `n = 100\nsieve = [True] * (n + 1)\nsieve[0] = sieve[1] = False\nfor i in range(2, int(n ** 0.5) + 1):\n    if sieve[i]:\n        for j in range(i * i, n + 1, i):\n            sieve[j] = False\nprimes = [i for i, ok in enumerate(sieve) if ok]\nprint(*primes[:25])\n`,
  },
  {
    lang: "javascript",
    file: "array-methods.js",
    note: "map / filter / reduce in one pass",
    code: `const nums = [5, 3, 9, 1, 7];\nconst doubled = nums.map(n => n * 2);\nconst big = nums.filter(n => n > 4);\nconst total = nums.reduce((a, b) => a + b, 0);\nconsole.log({ doubled, big, total });\n`,
  },
  {
    lang: "c",
    file: "scanf-sum.c",
    note: "reads two integers from the input box",
    stdin: true,
    code: `#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    if (scanf("%d %d", &a, &b) != 2) {\n        printf("expected two integers\\n");\n        return 1;\n    }\n    printf("%d + %d = %d\\n", a, b, a + b);\n    return 0;\n}\n`,
  },
  {
    lang: "cpp",
    file: "vector-sort.cpp",
    note: "std::vector + algorithms",
    code: `#include <algorithm>\n#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v{42, 7, 13, 99, 1};\n    std::sort(v.begin(), v.end());\n    for (int x : v) std::cout << x << ' ';\n    std::cout << '\\n';\n}\n`,
  },
  {
    lang: "java",
    file: "ScannerHello.java",
    note: "Scanner input + printf — runs once the relay is redeployed",
    stdin: true,
    code: `import java.util.Scanner;\n\npublic class ScannerHello {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        System.out.print("name? ");\n        System.out.println("hello, " + in.nextLine());\n    }\n}\n`,
  },
  {
    lang: "go",
    file: "hello-fmt.go",
    note: "the smallest useful Go program",
    code: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hello from the sandboxed runner")\n}\n`,
  },
  {
    lang: "rust",
    file: "fib.rs",
    note: "iterative fibonacci",
    code: `fn main() {\n    let (mut a, mut b) = (0u64, 1u64);\n    for _ in 0..10 {\n        print!("{a} ");\n        let next = a + b;\n        a = b;\n        b = next;\n    }\n    println!();\n}\n`,
  },
  {
    lang: "bash",
    file: "read-loop.sh",
    note: "reads lines from the input box",
    stdin: true,
    code: `#!/bin/bash\nwhile read -r line; do\n  echo "got: $line"\ndone\n`,
  },
];

const LANG_COLOR: Record<string, string> = {
  python: "#4c8dff",
  javascript: "#e7e7e7",
  c: "#8c8c8c",
  cpp: "#8c8c8c",
  java: "#f89820",
  go: "#00add8",
  rust: "#dea584",
  bash: "#6d6d6d",
};

export function LearnPanel() {
  const s = useAnon();

  // Esc closes the panel, matching every other overlay in the app
  useEffect(() => {
    if (!s.learnOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        useAnon.getState().toggleLearn();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.learnOpen]);

  if (!s.learnOpen) return null;

  /** Open a starter as a real file. Store contract (verified against
   *  src/lib/store.ts): addFile(name, language) creates the file with empty
   *  content and makes it active (synchronously, both local and Yjs
   *  session modes); updateFileContent(id, code) then fills it — two steps,
   * because addFile takes no content argument. */
  function load(ex: Starter) {
    s.addFile(ex.file, ex.lang);
    const id = useAnon.getState().activeFileId;
    if (id) s.updateFileContent(id, ex.code);
    if (ex.stdin) s.setStdinOpen(true);
    s.toggleLearn();
    toast.success(`${ex.file} opened`, {
      description: ex.stdin
        ? "type values in the terminal input box, then press Run"
        : "press ⌘↵ or the Run button to execute",
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className="fixed inset-0 z-50 flex items-start justify-end bg-black/40"
        onClick={() => s.toggleLearn()}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full w-full max-w-sm flex-col bg-[var(--anon-panel)] hairline-l shadow-2xl shadow-black/50"
        >
          {/* header */}
          <div className="flex h-11 items-center justify-between hairline-b px-4">
            <h2 className="anon-sans inline-flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 anon-accent" /> Learn
            </h2>
            <button onClick={() => s.toggleLearn()} className="anon-mut hover:anon-fg" aria-label="Close learn panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <p className="anon-mono text-[10px] anon-mut">
              starter files that run on the real sandboxed runner — open one, press Run.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {STARTERS.map((ex) => (
                <li key={ex.file} className="hairline bg-[var(--anon-raise)]">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span
                      className="anon-mono flex-none text-[9px] uppercase tracking-wider"
                      style={{ color: LANG_COLOR[ex.lang] || "var(--anon-mut)" }}
                    >
                      {ex.lang}
                    </span>
                    <span className="anon-mono flex-1 truncate text-xs anon-fg">{ex.file}</span>
                    {ex.stdin && (
                      <span className="anon-mono inline-flex flex-none items-center gap-1 text-[9px] anon-accent">
                        <Terminal className="h-3 w-3" /> stdin
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 pb-2">
                    <span className="anon-mono truncate text-[9.5px] anon-mut">{ex.note}</span>
                    <button
                      onClick={() => load(ex)}
                      className="anon-mono hairline anon-raise flex-none px-2 py-1 text-[10px] anon-mut hover:anon-fg inline-flex items-center gap-1"
                      aria-label={`Open ${ex.file}`}
                    >
                      <ArrowDownToLine className="h-3 w-3" /> open
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
