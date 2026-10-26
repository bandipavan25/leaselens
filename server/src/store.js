import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "leases.json");

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, "[]", "utf8");
  }
}

async function readAll() {
  await ensureStore();
  const raw = await readFile(dataFile, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(leases) {
  await ensureStore();
  await writeFile(dataFile, JSON.stringify(leases, null, 2), "utf8");
}

export function toListItem(lease) {
  return {
    id: lease.id,
    filename: lease.filename,
    createdAt: lease.createdAt,
    pageCount: lease.pageCount,
    title: lease.analysis?.summary?.title || lease.filename,
    propertyAddress: lease.analysis?.summary?.propertyAddress || "",
    overallRisk: lease.analysis?.overallRisk || null,
  };
}

export async function listLeases() {
  const leases = await readAll();
  return leases
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(toListItem);
}

export async function getLease(id) {
  const leases = await readAll();
  return leases.find((lease) => lease.id === id) || null;
}

export async function saveLease(lease) {
  const leases = await readAll();
  const index = leases.findIndex((item) => item.id === lease.id);
  if (index >= 0) {
    leases[index] = lease;
  } else {
    leases.unshift(lease);
  }
  await writeAll(leases);
  return lease;
}
