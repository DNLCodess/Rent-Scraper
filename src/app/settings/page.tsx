import { SettingsForm } from "@/components/settings-form";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm />
    </div>
  );
}
