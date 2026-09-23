#!/usr/bin/env node
/** Live runner matrix: all 8 languages + multi-line stdin inputs with CRLF against production relay. */
const RELAY = 'https://relay.avishkark.in'

const cases = [
  // Basic language executions
  ['python', 'print("PY-OK")\nprint(sum(range(10)))', '', 'PY-OK'],
  ['javascript', 'console.log("JS-OK"); console.log([1,2,3].map(x=>x*2).join(","))', '', 'JS-OK'],
  ['bash', 'echo BASH-OK; expr 6 \\* 7', '', 'BASH-OK'],
  ['c', '#include <stdio.h>\nint main(){printf("C-OK %d\\n", 42); return 0;}', '', 'C-OK'],
  ['cpp', '#include <iostream>\nint main(){std::cout << "CPP-OK " << 40+2 << std::endl;}', '', 'CPP-OK'],
  ['java', 'public class Main{public static void main(String[] a){System.out.println("JAVA-OK");}}', '', 'JAVA-OK'],
  ['go', 'package main\nimport "fmt"\nfunc main(){fmt.Println("GO-OK")}', '', 'GO-OK'],
  ['rust', 'fn main(){println!("RUST-OK");}', '', 'RUST-OK'],

  // Interactive Program Input (stdin) tests with CRLF line endings
  ['python', 'a = int(input())\nb = int(input())\nprint(f"PY-STDIN-SUM:{a+b}")', '15\r\n27\r\n', 'PY-STDIN-SUM:42'],
  ['c', '#include <stdio.h>\nint main(){int x, y; scanf("%d %d", &x, &y); printf("C-STDIN-SUM:%d\\n", x + y); return 0;}', '20\r\n22', 'C-STDIN-SUM:42'],
  ['cpp', '#include <iostream>\nint main(){int a, b; std::cin >> a >> b; std::cout << "CPP-STDIN-SUM:" << a + b << std::endl;}', '100 200\r\n', 'CPP-STDIN-SUM:300'],
  ['java', 'import java.util.Scanner;\npublic class Main{public static void main(String[] a){Scanner sc = new Scanner(System.in); int x = sc.nextInt(); int y = sc.nextInt(); System.out.println("JAVA-STDIN-SUM:" + (x + y));}}', '50\r\n50\r\n', 'JAVA-STDIN-SUM:100'],
  ['bash', 'read -r line1\nread -r line2\necho "BASH-STDIN:$line1-$line2"', 'alpha\r\nbeta\r\n', 'BASH-STDIN:alpha-beta'],
  ['javascript', 'const fs = require("fs"); const input = fs.readFileSync(0, "utf-8").trim(); console.log("JS-STDIN:" + input);', 'hello node\r\n', 'JS-STDIN:hello node'],
  ['go', 'package main\nimport "fmt"\nfunc main(){var a, b int; fmt.Scan(&a, &b); fmt.Println("GO-STDIN-SUM:", a+b)}', '33 44', 'GO-STDIN-SUM: 77'],
  ['rust', 'use std::io::BufRead;\nfn main(){let stdin = std::io::stdin(); let mut lines = stdin.lock().lines(); let l1 = lines.next().unwrap().unwrap(); println!("RUST-STDIN:{}", l1.trim());}', 'rust line\r\n', 'RUST-STDIN:rust line'],
]

async function main() {
  let pass = 0
  for (const [lang, code, stdin, expect] of cases) {
    const t0 = Date.now()
    try {
      const r = await fetch(`${RELAY}/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, code, stdin }),
        signal: AbortSignal.timeout(30000),
      })
      const j = await r.json().catch(() => ({}))
      const out = (j.stdout || '') + (j.stderr || '')
      const ok = (j.stdout || '').includes(expect)
      if (ok) pass++
      console.log(`${ok ? 'PASS' : 'FAIL'} | ${lang.padEnd(10)} stdin=${stdin ? 'yes' : 'no '} ${String(Date.now() - t0).padStart(5)}ms exit=${j.exitCode} :: ${out.trim().split('\n')[0].slice(0, 90)}`)
      if (!ok && j.stderr) console.log(`   --> STDERR: ${j.stderr}`)
    } catch (e) {
      console.log(`FAIL | ${lang.padEnd(10)} :: ${e.message.slice(0, 80)}`)
    }
  }
  console.log(`\n=== RUNNER MATRIX: ${pass}/${cases.length} test cases passed in production ===`)
  if (pass !== cases.length) process.exit(1)
}
main()
