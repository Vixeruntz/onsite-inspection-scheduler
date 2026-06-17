import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

const workspaceRoot = () => {
  const cwd = process.cwd();
  return cwd.endsWith(path.join("apps", "web")) ? path.resolve(cwd, "../..") : cwd;
};

export const POST = async (request: Request) => {
  if (process.env.VERCEL) return jsonError("云端部署不支持打开服务器文件夹，请查看浏览器下载记录", 400);

  let filePath: string | undefined;
  try {
    const body = await request.json() as { filePath?: string };
    filePath = body.filePath;
  } catch {
    return jsonError("缺少文件路径", 400);
  }

  if (!filePath) return jsonError("缺少文件路径", 400);

  const outputsDir = path.join(workspaceRoot(), "outputs");
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(outputsDir, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return jsonError("只能打开导出目录中的文件", 400);
  }

  try {
    await access(resolvedPath);
    await execFileAsync("open", ["-R", resolvedPath]);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("文件不存在或无法打开所在文件夹", 404);
  }
};
