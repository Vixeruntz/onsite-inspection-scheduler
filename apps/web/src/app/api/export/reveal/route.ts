export const dynamic = "force-dynamic";

const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export const POST = async () =>
  jsonError("云端部署不支持打开服务器文件夹，请查看浏览器下载记录", 400);
