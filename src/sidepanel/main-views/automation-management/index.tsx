import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import StorageSyncAutoGroup from "@/storage/autoGroup.sync";
import { Plus, Trash2, X, Play, Pause, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import Tooltip from "@/components/ui/tooltip";

const COLORS: NStorage.Sync.GroupColor[] = [
  "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"
];

const COLOR_MAP: Record<string, string> = {
  grey: "bg-slate-400",
  blue: "bg-blue-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  pink: "bg-pink-500",
  purple: "bg-purple-500",
  cyan: "bg-cyan-500",
  orange: "bg-orange-500",
};

function AutomationManagement() {
  const [rules, setRules] = useState<NStorage.Sync.Schema.AutoGroupRule[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newRule, setNewRule] = useState({
    title: "",
    color: "blue" as NStorage.Sync.GroupColor,
    urlPattern: ""
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    const data = await StorageSyncAutoGroup.getList();
    setRules(data);
  };

  const handleAddRule = async () => {
    if (!newRule.title || !newRule.urlPattern) return;

    const rule: NStorage.Sync.Schema.AutoGroupRule = {
      id: crypto.randomUUID(),
      title: newRule.title,
      color: newRule.color,
      urlPattern: newRule.urlPattern,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await StorageSyncAutoGroup.create(rule);
    setIsAdding(false);
    setNewRule({ title: "", color: "blue", urlPattern: "" });
    void fetchRules();
  };

  const toggleRule = async (rule: NStorage.Sync.Schema.AutoGroupRule) => {
    await StorageSyncAutoGroup.update({ ...rule, isActive: !rule.isActive });
    void fetchRules();
  };

  const deleteRule = async (id: string) => {
    await StorageSyncAutoGroup.deleteById(id);
    void fetchRules();
  };

  return (
    <div className="flex flex-col gap-4 p-2 pb-6">
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Auto-Grouping Rules
          </p>
        </div>
        <Button
          size="sm"
          className="h-7 rounded-full bg-slate-900 px-3 text-[10px] font-bold text-white hover:bg-slate-800"
          onClick={() => setIsAdding(true)}
        >
          <Plus size={12} className="mr-1" /> New Rule
        </Button>
      </section>

      {isAdding && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Create New Rule</h3>
            <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
          
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Group Identity</label>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  placeholder="Group Title (e.g. Work)"
                  className="flex-1 rounded-xl border-none bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none ring-1 ring-slate-200 focus:ring-slate-900"
                  value={newRule.title}
                  onChange={(e) => setNewRule({ ...newRule, title: e.target.value })}
                />
                <div className="flex flex-wrap gap-1 max-w-[120px]">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      className={cn(
                        "size-4 rounded-full transition-transform hover:scale-110",
                        COLOR_MAP[c],
                        newRule.color === c && "ring-2 ring-slate-900 ring-offset-1 scale-110"
                      )}
                      onClick={() => setNewRule({ ...newRule, color: c })}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">URL Pattern</label>
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200 focus-within:ring-slate-900">
                  <Globe size={12} className="text-slate-400" />
                  <input
                    placeholder="e.g. github.com, *.github.com, re:^https://..."
                    className="w-full border-none bg-transparent text-xs font-medium text-slate-700 outline-none"
                    value={newRule.urlPattern}
                    onChange={(e) => setNewRule({ ...newRule, urlPattern: e.target.value })}
                  />
                </div>
              </div>
              <p className="ml-1 text-[10px] text-slate-400">
                Plain host matches subdomains. Use <code className="font-mono">*</code> for glob or <code className="font-mono">re:</code> for explicit regex.
              </p>
            </div>

            <Button
              className="mt-1 w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              onClick={handleAddRule}
            >
              Add Rule
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {rules.length === 0 && !isAdding && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
            <p className="text-xs font-medium text-slate-400">No automation rules yet.</p>
          </div>
        )}

        {rules.map((rule) => (
          <div key={rule.id} className={cn(
            "group relative flex flex-col gap-3 rounded-2xl border p-3 transition-all hover:shadow-sm",
            rule.isActive ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100 opacity-70"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={cn("size-2.5 rounded-full shadow-sm", COLOR_MAP[rule.color])} />
                <h3 className="text-[13px] font-bold text-slate-800">{rule.title}</h3>
                {!rule.isActive && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">Paused</span>}
              </div>
              
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => toggleRule(rule)}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full transition-colors",
                        rule.isActive ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"
                      )}
                    >
                      {rule.isActive ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white">
                    {rule.isActive ? "Pause Rule" : "Resume Rule"}
                  </Tooltip.Content>
                </Tooltip>

                <Tooltip>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="flex size-7 items-center justify-center rounded-full text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white">
                    Delete
                  </Tooltip.Content>
                </Tooltip>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-100 ring-inset">
              <Globe size={10} className="text-slate-400" />
              <code className="truncate text-[10px] font-medium text-slate-500">
                {rule.urlPattern}
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AutomationManagement;
