#!/usr/bin/env node
/** Live runner matrix: all 8 languages against production relay. */
const RELAY = 'https://relay.avishkark.in'

const cases = [
  ['python', 'print("PY-OK")\nprint(sum(range(10)))', '', 'PY-OK'],
  ['javascript', 'console.log("JS-OK"); console.log([1,2,3].map(x=>x*2).join(","))', '', 'JS-OK'],
  ['bash', 'echo BASH-OK; expr 6 \\* 7', '', 'BASH-OK'],
  ['c', '#include <stdio.h>\nint main(){printf("C-OK %d\\n", 42); return 0;}', '', 'C-OK'],
  ['cpp', '#include <iostream>\nint main(){std::cout << "CPP-OK " << 40+2 << std::endl;}', '', 'CPP-OK'],
  ['java', 'public class Main{public static void main(String[] a){System.out.println("JAVA-OK");}}', '', 'JAVA-OK'],
  ['go', 'package main\nimport "fmt"\nfunc main(){fmt.Println("GO-OK")}', '', 'GO-OK'],
  ['rust', 'fn main(){println!("RUST-OK");}', '', 'RUST-OK'],
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
      console.log(`${ok ? 'PASS' : 'FAIL'} | ${lang.padEnd(10)} ${String(Date.now() - t0).padStart(5)}ms exit=${j.exitCode} :: ${out.trim().split('\n')[0].slice(0, 90)}`)
    } catch (e) {
      console.log(`FAIL | ${lang.padEnd(10)} :: ${e.message.slice(0, 80)}`)
    }
  }
  console.log(`\n=== RUNNER MATRIX: ${pass}/${cases.length} languages work in production ===`)
}
main()
