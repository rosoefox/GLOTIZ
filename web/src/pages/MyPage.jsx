import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import { Badge, Card, Button, TextField } from "../components/ui";
import { user, myPage as mp, myExportItems as mi } from "../data/mockData";
import { useAuth } from "../context/AuthContext";

export default function MyPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    loginId: user.loginId,
    email: user.email,
    phone: user.phone,
    company: user.company,
  });

  const handleWithdraw = () => {
    if (window.confirm(mp.dangerZone.confirmMessage)) {
      logout();
      navigate("/");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{mp.title}</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">{mp.subtitle}</p>

      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
              {user.name[0]}
            </div>
            <div>
              <p className="font-bold text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">{user.role} · {user.company}</p>
            </div>
          </div>
          {!editing && (
            <Button variant="secondary" className="px-4 py-2 text-sm" onClick={() => setEditing(true)}>
              {mp.editButtonLabel}
            </Button>
          )}
        </div>

        <hr className="mb-5 border-slate-100" />

        <h2 className="mb-4 text-sm font-bold text-slate-900">{mp.sectionTitle}</h2>

        {editing ? (
          <div className="space-y-4">
            <TextField
              label={mp.fields.loginId}
              value={form.loginId}
              onChange={(e) => setForm((f) => ({ ...f, loginId: e.target.value }))}
            />
            <TextField
              label={mp.fields.email}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <TextField
              label={mp.fields.phone}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <TextField
              label={mp.fields.company}
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" className="px-4 py-2 text-sm" onClick={() => setEditing(false)}>
                {mp.cancelButtonLabel}
              </Button>
              <Button className="px-4 py-2 text-sm" onClick={() => setEditing(false)}>
                <Icon name="check" className="h-4 w-4" />
                {mp.saveButtonLabel}
              </Button>
            </div>
          </div>
        ) : (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">{mp.fields.loginId}</dt>
              <dd className="font-medium text-slate-900">{form.loginId}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">{mp.fields.email}</dt>
              <dd className="font-medium text-slate-900">{form.email}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">{mp.fields.phone}</dt>
              <dd className="font-medium text-slate-900">{form.phone}</dd>
            </div>
            <div className="flex justify-between pb-1">
              <dt className="text-slate-500">{mp.fields.company}</dt>
              <dd className="font-medium text-slate-900">{form.company}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card className="mt-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{mp.exportItemsTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{mp.exportItemsSubtitle}</p>
          </div>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => navigate("/my-items")}>
            {mp.viewAllLabel}
            <Icon name="arrowRight" className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-3">
          {mi.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.category} · {item.destination} 수출
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={mi.statusTone[item.status]}>{mi.statusLabels[item.status]}</Badge>
                <span className="text-xs text-slate-400">
                  {mp.docStatusLabel}: {item.basicInfoDone ? mi.basicInfoDoneLabel : mi.basicInfoPendingLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6 border-red-100 bg-red-50/40 p-6">
        <h3 className="text-sm font-bold text-red-600">{mp.dangerZone.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-red-500/80">{mp.dangerZone.description}</p>
        <Button
          variant="secondary"
          className="mt-4 border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          onClick={handleWithdraw}
        >
          {mp.dangerZone.buttonLabel}
        </Button>
      </Card>
    </div>
  );
}
