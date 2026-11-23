import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center text-center p-6">
      <div>
        <p className="font-mono text-[13px] text-muted">404</p>
        <h1 className="text-2xl font-semibold mt-1">Page not found</h1>
        <p className="text-muted mt-2">The page you requested does not exist or you do not have access to it.</p>
        <Link to="/app" className="inline-block mt-4 text-link hover:underline">Go to overview</Link>
      </div>
    </div>
  );
}
