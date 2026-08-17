const usage = `Usage: npm run ccsolver:cli -- <command>

CCSolver command surface (P0A foundation)

Commands will be added by later milestones. Use --help to inspect this surface.`;

const arguments_ = process.argv.slice(2);

if (arguments_.length === 0 || arguments_.includes("--help") || arguments_.includes("-h")) {
  console.log(usage);
} else {
  console.error(`Unknown CCSolver command: ${arguments_[0]}`);
  console.error(usage);
  process.exitCode = 2;
}
