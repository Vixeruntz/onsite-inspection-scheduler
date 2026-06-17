export const dynamic = "force-dynamic";

export const GET = async () =>
  Response.json(
    {
      ok: true,
      service: "onsite-inspection-scheduler",
      checkedAt: new Date().toISOString()
    },
    { headers: { "Cache-Control": "no-store" } }
  );
