"use client";

import { useState } from "react";
import { updateRetailerProfile } from "../../actions/retailer";

export default function SettingsClient({ retailer, planName }: { retailer: any; planName: string }) {
  const [storeName, setStoreName] = useState(retailer.storeName);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ text: "", type: "" });

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ text: "", type: "" });

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileMsg({ text: "", type: "" });

    try {
      await updateRetailerProfile(storeName);
      setProfileMsg({ text: "Profile updated successfully.", type: "success" });
    } catch (err: any) {
      setProfileMsg({ text: err.message || "Failed to update profile", type: "error" });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingPassword(true);
    setPasswordMsg({ text: "", type: "" });

    if (password.length < 8) {
      setPasswordMsg({ text: "Password must be at least 8 characters", type: "error" });
      setIsUpdatingPassword(false);
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMsg({ text: "Passwords do not match", type: "error" });
      setIsUpdatingPassword(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        setPasswordMsg({ text: data.error || "Failed to update password", type: "error" });
      } else {
        setPasswordMsg({ text: "Password updated successfully.", type: "success" });
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      setPasswordMsg({ text: "Network error", type: "error" });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <div className="bg-white rounded-3xl shadow-soft border border-manikan-border overflow-hidden animate-fade-up" style={{ animationDelay: "100ms" }}>
        <div className="px-8 py-5 border-b border-manikan-border flex items-center gap-3 bg-forest-50/30">
          <div className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg, #C8966A, #F0C080)" }} />
          <h3 className="text-lg font-display font-semibold text-forest-900">Store Profile</h3>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleProfileUpdate} className="max-w-md space-y-5">
            <div>
              <label className="block text-xs font-medium text-forest-700 uppercase tracking-wider mb-1.5">
                Email Address (Read-only)
              </label>
              <input
                type="text"
                disabled
                value={retailer.email}
                className="w-full px-4 py-2.5 rounded-xl border border-forest-100 bg-forest-50/50 text-forest-900/60 text-sm focus:outline-none cursor-not-allowed"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-forest-700 uppercase tracking-wider mb-1.5">
                  Plan
                </label>
                <div className="w-full px-4 py-2.5 rounded-xl border border-forest-100 bg-forest-50/50 text-forest-900/60 text-sm capitalize">
                  {planName}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-forest-700 uppercase tracking-wider mb-1.5">
                  Member Since
                </label>
                <div className="w-full px-4 py-2.5 rounded-xl border border-forest-100 bg-forest-50/50 text-forest-900/60 text-sm">
                  {new Date(retailer.createdAt).toLocaleDateString("en", { month: "short", year: "numeric" })}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-forest-700 uppercase tracking-wider mb-1.5">
                Store Name
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-forest-200 bg-white text-forest-900 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-colors"
              />
            </div>

            {profileMsg.text && (
              <p className={`text-sm ${profileMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
                {profileMsg.text}
              </p>
            )}

            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="px-6 py-2.5 bg-forest-900 text-white rounded-xl text-sm font-medium hover:bg-forest-800 transition-colors disabled:opacity-50"
            >
              {isUpdatingProfile ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>

      {/* Password Section */}
      <div className="bg-white rounded-3xl shadow-soft border border-manikan-border overflow-hidden animate-fade-up" style={{ animationDelay: "200ms" }}>
        <div className="px-8 py-5 border-b border-manikan-border flex items-center gap-3 bg-forest-50/30">
          <div className="w-1 h-6 rounded-full" style={{ background: "linear-gradient(180deg, #C8966A, #F0C080)" }} />
          <h3 className="text-lg font-display font-semibold text-forest-900">Security</h3>
        </div>
        
        <div className="p-8">
          <form onSubmit={handlePasswordUpdate} className="max-w-md space-y-5">
            <div>
              <label className="block text-xs font-medium text-forest-700 uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl border border-forest-200 bg-white text-forest-900 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-forest-700 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl border border-forest-200 bg-white text-forest-900 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-colors"
              />
            </div>

            {passwordMsg.text && (
              <p className={`text-sm ${passwordMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>
                {passwordMsg.text}
              </p>
            )}

            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="px-6 py-2.5 bg-forest-900 text-white rounded-xl text-sm font-medium hover:bg-forest-800 transition-colors disabled:opacity-50"
            >
              {isUpdatingPassword ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
