export const dynamic = "force-dynamic";

export const POST = async () =>
  Response.json(
    { error: "云端部署不保存服务器文件，请使用页面上的下载按钮并查看浏览器下载记录" },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
