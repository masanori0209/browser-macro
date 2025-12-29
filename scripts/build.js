/* eslint-disable no-console */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const outDir = path.resolve(__dirname, "..", "dist");

const baseOptions = {
  bundle: true,
  format: "esm",
  sourcemap: true,
  target: "es2021",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production")
  }
};

const isWatch = process.env.WATCH === "1";

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.promises.copyFile(src, dest);
}

async function cleanDist() {
  await fs.promises.rm(outDir, { recursive: true, force: true });
  await ensureDir(outDir);
}

const buildTargets = [
  {
    entryPoints: [path.resolve(__dirname, "..", "src/background/index.ts")],
    outfile: path.resolve(outDir, "background/index.js")
  },
  {
    entryPoints: [path.resolve(__dirname, "..", "src/content/index.ts")],
    outfile: path.resolve(outDir, "content/index.js")
  },
  {
    entryPoints: [path.resolve(__dirname, "..", "src/popup/index.tsx")],
    outfile: path.resolve(outDir, "popup/index.js")
  },
  {
    entryPoints: [path.resolve(__dirname, "..", "src/options/index.tsx")],
    outfile: path.resolve(outDir, "options/index.js")
  }
];

async function build() {
  await cleanDist();

  if (isWatch) {
    const contexts = await Promise.all(
      buildTargets.map((opts) => esbuild.context({ ...baseOptions, ...opts }))
    );

    await Promise.all(contexts.map((ctx) => ctx.watch()));
    await Promise.all([
      copyFile(path.resolve(__dirname, "..", "src/manifest.json"), path.resolve(outDir, "manifest.json")),
      copyFile(path.resolve(__dirname, "..", "src/popup/index.html"), path.resolve(outDir, "popup/index.html")),
      copyFile(path.resolve(__dirname, "..", "src/options/index.html"), path.resolve(outDir, "options/index.html"))
    ]);

    console.log("Watch mode: rebuilding on change. Press Ctrl+C to stop.");

    process.on("SIGINT", async () => {
      console.log("Stopping watcher...");
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
      process.exit(0);
    });
  } else {
    await Promise.all(buildTargets.map((opts) => esbuild.build({ ...baseOptions, ...opts })));
    await Promise.all([
      copyFile(path.resolve(__dirname, "..", "src/manifest.json"), path.resolve(outDir, "manifest.json")),
      copyFile(path.resolve(__dirname, "..", "src/popup/index.html"), path.resolve(outDir, "popup/index.html")),
      copyFile(path.resolve(__dirname, "..", "src/options/index.html"), path.resolve(outDir, "options/index.html"))
    ]);
  }
}

build()
  .then(() => console.log(isWatch ? "Watch mode ready." : "Build completed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });


