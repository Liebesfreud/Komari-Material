import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

export function loadTypescript(file, globals = {}, dependencies = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency: ${name}`)
      return dependencies[name]
    },
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    ...globals,
  }, { filename: file })
  return exports
}
