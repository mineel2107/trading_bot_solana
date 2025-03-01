import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getOutputDir() {
  const outputDir = path.join(__dirname, "../../output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

export function getLogDir() {
  const logDir = path.join(getOutputDir(), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

export function createDateBasedFileName(prefix, extension) {
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}_${date}.${extension}`;
}

export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export function cleanOldFiles(directory, maxAgeHours = 24) {
  const files = fs.readdirSync(directory);
  const now = Date.now();

  files.forEach((file) => {
    const filePath = path.join(directory, file);
    const stats = fs.statSync(filePath);
    const ageHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);

    if (ageHours > maxAgeHours) {
      fs.unlinkSync(filePath);
      console.log(`Deleted old file: ${file}`);
    }
  });
}
