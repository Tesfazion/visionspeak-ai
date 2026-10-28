// Where diagnostic output goes.
//
// The agent shell used to develop this project cannot capture stdout from child
// processes, so every probe/build/test script persists its transcript to a file.
// Writing those files into the repository root buried the real project files, so
// they now live under docs/:
//
//   docs/notes       scratch .txt notes and grep output
//   docs/logs        server, build and test transcripts (.log)
//   docs/artifacts   machine-readable probe reports (.json) and leftovers
//
// Every writer must go through this module so a new script can never litter the root.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(root, "docs");

function target(folder, name) {
  const file = path.join(docsDir, folder, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

module.exports = {
  root,
  docsDir,
  notePath: (name) => target("notes", name),
  logPath: (name) => target("logs", name),
  artifactPath: (name) => target("artifacts", name),
};
