const usage = `Usage: npm run ccsolver:dossier -- <command>

CCSolver dossier command surface (P0A foundation)

Dossier generation begins in P4; this command currently exposes help only.`;

const arguments_ = process.argv.slice(2);

if (arguments_.length === 0 || arguments_.includes("--help") || arguments_.includes("-h")) {
  console.log(usage);
} else {
  console.error(`Unknown CCSolver dossier command: ${arguments_[0]}`);
  console.error(usage);
  process.exitCode = 2;
}
