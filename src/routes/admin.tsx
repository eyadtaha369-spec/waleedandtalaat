import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pure layout route: this file's only job is to let TanStack Router
// nest /admin/index.tsx and /admin/installments.tsx underneath /admin.
// Without an <Outlet /> here, child routes update the URL but never
// actually render — the screen just keeps showing whatever this file
// renders. Each child page still does its own auth check.
export const Route = createFileRoute("/admin")({
  component: () => <Outlet />,
});
