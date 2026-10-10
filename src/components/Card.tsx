export function AuthCard({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-xl font-bold">{title}</h1>
          {description && <div className="text-sm text-slate-600">{description}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
