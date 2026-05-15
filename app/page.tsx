"use client";

import { useEffect, useRef, useState } from "react";
import { setCookie, getCookie } from "cookies-next";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string;
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;

type LoginResult = { userToken: string; encryptionKey: string; };
type Wallet = { id: string; address: string; blockchain: string; [key: string]: unknown; };

export default function HomePage() {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [deviceIdLoading, setDeviceIdLoading] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string>("");
  const [deviceEncryptionKey, setDeviceEncryptionKey] = useState<string>("");
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Initializing...");
  const [activeTab, setActiveTab] = useState<"dashboard" | "send" | "receive" | "garden" | "history">("dashboard");
  const [seeds, setSeeds] = useState<{amount: string; plantedAt: number}[]>([]);
  const [seedAmount, setSeedAmount] = useState("");
  const [seedMsg, setSeedMsg] = useState<{type:"ok"|"err", text:string}|null>(null);
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{type:"ok"|"err", text:string}|null>(null);
  const [copied, setCopied] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initSdk = async () => {
      try {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        const onLoginComplete = (error: unknown, result: any) => {
          if (cancelled) return;
          if (error) {
            const err = error as any;
            setLoginError(err.message || "Login failed");
            setLoginResult(null);
            setStatus("Login failed");
            return;
          }
          setLoginResult({ userToken: result.userToken, encryptionKey: result.encryptionKey });
          setLoginError(null);
          setStatus("Logged in.");
        };
        const restoredAppId = (getCookie("appId") as string) || appId || "";
        const restoredGoogleClientId = (getCookie("google.clientId") as string) || googleClientId || "";
        const restoredDeviceToken = (getCookie("deviceToken") as string) || "";
        const restoredDeviceEncryptionKey = (getCookie("deviceEncryptionKey") as string) || "";
        const sdk = new W3SSdk({
          appSettings: { appId: restoredAppId },
          loginConfigs: {
            deviceToken: restoredDeviceToken,
            deviceEncryptionKey: restoredDeviceEncryptionKey,
            google: {
              clientId: restoredGoogleClientId,
              redirectUri: typeof window !== "undefined" ? window.location.origin : "",
              selectAccountPrompt: true,
            },
          },
        }, onLoginComplete);
        sdkRef.current = sdk;
        if (!cancelled) { setSdkReady(true); setStatus("Ready"); }
      } catch (err) {
        if (!cancelled) setStatus("Failed to initialize SDK");
      }
    };
    void initSdk();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const fetchDeviceId = async () => {
      if (!sdkRef.current) return;
      try {
        const cached = typeof window !== "undefined" ? window.localStorage.getItem("deviceId") : null;
        if (cached) { setDeviceId(cached); return; }
        setDeviceIdLoading(true);
        const id = await sdkRef.current.getDeviceId();
        setDeviceId(id);
        if (typeof window !== "undefined") window.localStorage.setItem("deviceId", id);
      } catch { setStatus("Failed to get device ID"); }
      finally { setDeviceIdLoading(false); }
    };
    if (sdkReady) void fetchDeviceId();
  }, [sdkReady]);

  async function loadUsdcBalance(userToken: string, walletId: string) {
    try {
      const response = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getTokenBalance", userToken, walletId }),
      });
      const data = await response.json();
      const balances = (data.tokenBalances as any[]) || [];
      const usdcEntry = balances.find((t) => {
        const symbol = t.token?.symbol || "";
        const name = t.token?.name || "";
        return symbol.startsWith("USDC") || name.includes("USDC");
      }) ?? null;
      setUsdcBalance(usdcEntry?.amount ?? "0");
    } catch { setStatus("Failed to load balance"); }
  }

  const loadWallets = async (userToken: string, source?: string) => {
    try {
      setStatus("Loading wallet...");
      const response = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listWallets", userToken }),
      });
      const data = await response.json();
      const w = (data.wallets as Wallet[]) || [];
      setWallets(w);
      if (w.length > 0) {
        await loadUsdcBalance(userToken, w[0].id);
        setStatus(source === "afterCreate" ? "Wallet created!" : "Wallet loaded.");
        void loadTransactions(userToken, w[0].id);
      } else {
        setStatus("No wallets found.");
      }
    } catch { setStatus("Failed to load wallet"); }
  };

  const handleCreateDeviceToken = async () => {
    if (!deviceId) return;
    setStatus("Creating device token...");
    try {
      const response = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const data = await response.json();
      if (!response.ok) { setStatus("Failed to create device token"); return; }
      setDeviceToken(data.deviceToken);
      setDeviceEncryptionKey(data.deviceEncryptionKey);
      setCookie("deviceToken", data.deviceToken);
      setCookie("deviceEncryptionKey", data.deviceEncryptionKey);
      setStatus("Device token ready.");
    } catch { setStatus("Failed to create device token"); }
  };

  const handleLoginWithGoogle = () => {
    const sdk = sdkRef.current;
    if (!sdk || !deviceToken || !deviceEncryptionKey) return;
    setCookie("appId", appId);
    setCookie("google.clientId", googleClientId);
    setCookie("deviceToken", deviceToken);
    setCookie("deviceEncryptionKey", deviceEncryptionKey);
    sdk.updateConfigs({
      appSettings: { appId },
      loginConfigs: {
        deviceToken, deviceEncryptionKey,
        google: { clientId: googleClientId, redirectUri: window.location.origin, selectAccountPrompt: true },
      },
    });
    setStatus("Redirecting to Google...");
    sdk.performLogin(SocialLoginProvider.GOOGLE);
  };

  const handleInitializeUser = async () => {
    if (!loginResult?.userToken) return;
    setStatus("Initializing user...");
    try {
      const response = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initializeUser", userToken: loginResult.userToken }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === 155106) { await loadWallets(loginResult.userToken, "alreadyInitialized"); setChallengeId(null); return; }
        setStatus("Failed: " + (data.error || data.message)); return;
      }
      setChallengeId(data.challengeId);
      setStatus("Ready to create wallet.");
    } catch { setStatus("Failed to initialize user"); }
  };

  const handleExecuteChallenge = () => {
    const sdk = sdkRef.current;
    if (!sdk || !challengeId || !loginResult) return;
    sdk.setAuthentication({ userToken: loginResult.userToken, encryptionKey: loginResult.encryptionKey });
    setStatus("Creating wallet...");
    sdk.execute(challengeId, (error) => {
      if (error) { setStatus("Failed: " + (error as any)?.message); return; }
      void (async () => {
        await new Promise((r) => setTimeout(r, 2000));
        setChallengeId(null);
        await loadWallets(loginResult.userToken, "afterCreate");
      })();
    });
  };

  const handleBack = () => {
    setLoginResult(null);
    setDeviceToken("");
    setDeviceEncryptionKey("");
    setChallengeId(null);
    setLoginError(null);
    setStatus("Ready");
  };

  const loadTransactions = async (userToken: string, walletId: string) => {
    setTxLoading(true);
    try {
      const response = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getTransactions", userToken, walletId }),
      });
      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch { console.error("Failed to load transactions"); }
    setTxLoading(false);
  };

  const primaryWallet = wallets[0];
  const isLoggedIn = !!loginResult;
  const hasWallet = wallets.length > 0;

  const steps = [
    { label: "Create device token", done: !!deviceToken, action: handleCreateDeviceToken, disabled: !sdkReady || !deviceId || deviceIdLoading || !!deviceToken },
    { label: "Sign in with Google", done: isLoggedIn, action: handleLoginWithGoogle, disabled: !deviceToken || isLoggedIn },
    { label: "Initialize account", done: hasWallet || !!challengeId, action: handleInitializeUser, disabled: !isLoggedIn || hasWallet },
    { label: "Create wallet", done: hasWallet, action: handleExecuteChallenge, disabled: !challengeId || hasWallet },
  ];

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
    { id: "send", label: "Send", icon: "ti-arrow-up" },
    { id: "receive", label: "Receive", icon: "ti-arrow-down" },
    { id: "garden", label: "Garden", icon: "ti-plant" },
    { id: "history", label: "History", icon: "ti-list" },
  ] as const;

  const S = {
    app: { display: "flex", minHeight: "100vh", background: "#f0eff5" } as React.CSSProperties,
    sidebar: { width: 220, background: "#fff", borderRight: "1px solid #e5e3ed", display: "flex", flexDirection: "column" as const, padding: "24px 0" },
    logo: { display: "flex", alignItems: "center", gap: 10, padding: "0 18px 28px" },
    logoIcon: { width: 34, height: 34, borderRadius: "50%", background: "#1b1464", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14 },
    logoText: { fontSize: 15, fontWeight: 800, color: "#1b1464", letterSpacing: "-0.3px" },
    main: { flex: 1, padding: 32, display: "flex", flexDirection: "column" as const, gap: 20 },
    balCard: { background: "#1b1464", borderRadius: 16, padding: 24, color: "#fff" },
    balLabel: { fontSize: 11, fontWeight: 700, opacity: .6, textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 },
    balAmount: { fontSize: 38, fontWeight: 800, letterSpacing: "-1.5px", marginBottom: 4 },
    balUsd: { fontSize: 14, opacity: .6 },
    balActions: { display: "flex", gap: 10, marginTop: 20 },
    balBtn: { background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
    balBtnPrimary: { background: "#fff", border: "none", color: "#1b1464", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
    card: { background: "#fff", borderRadius: 14, border: "1px solid #e5e3ed", padding: 20 },
    cardTitle: { fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 16 },
    input: { width: "100%", background: "#f8f7fc", border: "1px solid #e5e3ed", borderRadius: 10, padding: "11px 14px", fontSize: 14, color: "#1a1a2e", outline: "none" },
    sendBtn: { width: "100%", background: "#1b1464", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  };

  return (
    <div style={S.app}>
      <aside style={S.sidebar}>
        <div style={S.logo}>
          <div style={S.logoIcon}>H</div>
          <span style={S.logoText}>HashCrew<br/>Arc Testnet</span>
        </div>
        {nav.map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", fontSize: 13, fontWeight: 600, color: activeTab === item.id ? "#1b1464" : "#999", background: activeTab === item.id ? "#f0eff5" : "transparent", borderRight: activeTab === item.id ? "3px solid #1b1464" : "3px solid transparent", border: "none", textAlign: "left", cursor: "pointer", width: "100%" }}>
            <i className={`ti ${item.icon}`} aria-hidden="true" style={{ fontSize: 16 }}></i>
            {item.label}
          </button>
        ))}
        <div style={{ marginTop: "auto", padding: "16px 18px", borderTop: "1px solid #f0eff5" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#bbb", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>Status</div>
          <div style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>{status}</div>
        </div>
      </aside>

      <main style={S.main}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2e", letterSpacing: "-0.5px", textTransform: "capitalize" }}>{activeTab}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isLoggedIn && !hasWallet && (
              <button onClick={handleBack} style={{ background: "transparent", color: "#888", border: "1px solid #e5e3ed", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>← Back</button>
            )}
            <span style={{ fontSize: 11, fontWeight: 700, background: "#e8e6f8", color: "#1b1464", padding: "5px 12px", borderRadius: 20, letterSpacing: ".04em" }}>ARC TESTNET</span>
          </div>
        </div>

        {!hasWallet && isLoggedIn && (
          <button onClick={handleBack} style={{ background: "transparent", color: "#888", border: "1px solid #e5e3ed", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>← Back</button>
        )}
        {!hasWallet && (
          <div style={S.card}>
            <div style={{ ...S.cardTitle, marginBottom: 20 }}>Set up your wallet</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {steps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: step.done ? "#f8f7fc" : "#fff", borderRadius: 10, border: "1px solid #e5e3ed" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: step.done ? "#1b1464" : "#f0eff5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: step.done ? "#fff" : "#999", fontWeight: 700, flexShrink: 0 }}>{step.done ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: step.done ? "#bbb" : "#1a1a2e", flex: 1, textDecoration: step.done ? "line-through" : "none" }}>{step.label}</span>
                  {!step.done && (
                    <button onClick={step.action} disabled={step.disabled} style={{ background: step.disabled ? "#f0eff5" : "#1b1464", color: step.disabled ? "#bbb" : "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: step.disabled ? "not-allowed" : "pointer" }}>
                      {i === 1 ? "Sign in" : "Start"}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {loginError && <div style={{ marginTop: 12, fontSize: 12, color: "#c62828", background: "#fce8e8", padding: "10px 14px", borderRadius: 8, fontWeight: 500 }}>{loginError}</div>}
          </div>
        )}

        {hasWallet && activeTab === "dashboard" && (
          <>
            <div style={S.balCard}>
              <div style={S.balLabel}>Total Balance</div>
              <div style={S.balAmount}>{usdcBalance ? parseFloat(usdcBalance).toFixed(2) : "0.00"} USDC</div>
              <div style={S.balUsd}>≈ ${usdcBalance ? parseFloat(usdcBalance).toFixed(2) : "0.00"} USD</div>
              <div style={S.balActions}>
                <button style={S.balBtnPrimary} onClick={() => setActiveTab("send")}><i className="ti ti-arrow-up" aria-hidden="true"></i> Send</button>
                <button style={S.balBtn} onClick={() => setActiveTab("receive")}><i className="ti ti-arrow-down" aria-hidden="true"></i> Receive</button>
                <button style={S.balBtn} onClick={() => setActiveTab("history")}><i className="ti ti-list" aria-hidden="true"></i> History</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={S.card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Blockchain</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{primaryWallet.blockchain}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4, fontWeight: 500 }}>Network</div>
              </div>
              <div style={S.card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Wallet</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", fontFamily: "monospace" }}>{primaryWallet.address.slice(0,8)}...{primaryWallet.address.slice(-6)}</div>
                <button onClick={() => { navigator.clipboard.writeText(primaryWallet.address); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ marginTop: 8, background: "transparent", border: "1px solid #e5e3ed", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: copied ? "#1b1464" : "#888", cursor: "pointer" }}>{copied ? "Copied!" : "Copy"}</button>
              </div>
            </div>
          </>
        )}

        {hasWallet && activeTab === "send" && (
          <div style={{ ...S.card, maxWidth: 500 }}>
            <div style={S.cardTitle}>Send USDC</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#888", display: "block", marginBottom: 6 }}>Recipient address</label>
                <input value={sendAddress} onChange={e => setSendAddress(e.target.value)} placeholder="0x..." style={S.input} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#888", display: "block", marginBottom: 6 }}>Amount (USDC)</label>
                <input value={sendAmount} onChange={e => setSendAmount(e.target.value)} type="number" placeholder="0.00" style={S.input} />
              </div>
              <button disabled={sending || !sendAddress || !sendAmount} onClick={async () => {
                setSending(true); setSendMsg(null);
                try {
                  const res = await fetch("/api/endpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getTransferChallenge", userToken: loginResult?.userToken, walletId: primaryWallet?.id, destinationAddress: sendAddress, amount: sendAmount }) });
                  const data = await res.json();
                  if (!res.ok) { setSendMsg({ type: "err", text: data.message || "Failed to send" }); setSending(false); return; }
                  const sdk = sdkRef.current;
                  if (!sdk || !data.challengeId) { setSendMsg({ type: "err", text: "No challenge ID" }); setSending(false); return; }
                  sdk.setAuthentication({ userToken: loginResult!.userToken, encryptionKey: loginResult!.encryptionKey });
                  sdk.execute(data.challengeId, async (error) => {
                    if (error) { setSendMsg({ type: "err", text: "Rejected: " + (error as any)?.message }); }
                    else { setSendMsg({ type: "ok", text: "Transaction confirmed!" }); setSendAddress(""); setSendAmount(""); if (loginResult?.userToken) await loadWallets(loginResult.userToken); }
                    setSending(false);
                  });
                } catch { setSendMsg({ type: "err", text: "Network error" }); setSending(false); }
              }} style={{ ...S.sendBtn, opacity: sending || !sendAddress || !sendAmount ? 0.5 : 1, cursor: sending || !sendAddress || !sendAmount ? "not-allowed" : "pointer" }}>
                {sending ? "Confirming..." : "Send USDC"}
              </button>
              {sendMsg && <div style={{ fontSize: 13, padding: "10px 14px", borderRadius: 10, background: sendMsg.type === "ok" ? "#e8f5e9" : "#fce8e8", color: sendMsg.type === "ok" ? "#2e7d32" : "#c62828", fontWeight: 600 }}>{sendMsg.text}</div>}
            </div>
          </div>
        )}

        {hasWallet && activeTab === "receive" && (
          <div style={{ ...S.card, maxWidth: 500 }}>
            <div style={S.cardTitle}>Receive USDC</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 16, fontWeight: 500 }}>Share your wallet address to receive USDC on Arc Testnet</div>
            <div style={{ background: "#f8f7fc", border: "1px solid #e5e3ed", borderRadius: 10, padding: "14px 16px", fontFamily: "monospace", fontSize: 13, color: "#1a1a2e", wordBreak: "break-all", marginBottom: 14 }}>{primaryWallet.address}</div>
            <button onClick={() => { navigator.clipboard.writeText(primaryWallet.address); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ ...S.sendBtn, background: copied ? "#2e7d32" : "#1b1464" }}>
              {copied ? "Copied!" : "Copy address"}
            </button>
            <div style={{ marginTop: 16, fontSize: 12, color: "#bbb", fontWeight: 500 }}>Get free testnet USDC at <a href="https://faucet.circle.com" style={{ color: "#1b1464", fontWeight: 700 }}>faucet.circle.com</a></div>
          </div>
        )}

        {hasWallet && activeTab === "garden" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Staked", value: seeds.reduce((a, s) => a + parseFloat(s.amount || "0"), 0).toFixed(2) + " USDC" },
                { label: "Plants", value: seeds.length + " / 6" },
                { label: "Longest", value: seeds.length > 0 ? Math.max(...seeds.map(s => Math.floor((Date.now() - s.plantedAt) / 86400000))) + " days" : "0 days" },
              ].map((m, i) => (
                <div key={i} style={S.card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{m.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a2e" }}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Your garden</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                {seeds.map((seed, i) => {
                  const days = Math.floor((Date.now() - seed.plantedAt) / 86400000);
                  const plant = days >= 14 ? "🌳" : days >= 7 ? "🌸" : days >= 3 ? "🌿" : "🌱";
                  const stage = days >= 14 ? "Tree" : days >= 7 ? "Flower" : days >= 3 ? "Plant" : "Sprout";
                  return (
                    <div key={i} style={{ background: "#f8f7fc", borderRadius: 10, border: "1px solid #e5e3ed", padding: 14, textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 6 }}>{plant}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1b1464" }}>{parseFloat(seed.amount).toFixed(2)} USDC</div>
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{stage} · {days}d</div>
                      <button onClick={() => { setSeeds(prev => prev.filter((_, j) => j !== i)); setSeedMsg({ type: "ok", text: "Harvested " + parseFloat(seed.amount).toFixed(2) + " USDC!" }); setTimeout(() => setSeedMsg(null), 3000); }} style={{ marginTop: 8, background: "#1b1464", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Harvest</button>
                    </div>
                  );
                })}
                {Array.from({ length: Math.max(0, 6 - seeds.length) }).map((_, i) => (
                  <div key={i} style={{ background: "#f8f7fc", borderRadius: 10, border: "2px dashed #e5e3ed", padding: 14, textAlign: "center" }}>
                    <div style={{ fontSize: 20, color: "#ddd", marginBottom: 4 }}><i className="ti ti-plus" aria-hidden="true"></i></div>
                    <div style={{ fontSize: 11, color: "#bbb", fontWeight: 600 }}>Empty plot</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: seedMsg ? 10 : 0 }}>
                <input value={seedAmount} onChange={e => setSeedAmount(e.target.value)} type="number" placeholder="Amount to stake (USDC)" style={{ ...S.input, flex: 1 }} />
                <button onClick={() => {
                  if (!seedAmount || parseFloat(seedAmount) <= 0) { setSeedMsg({ type: "err", text: "Enter a valid amount" }); return; }
                  if (seeds.length >= 6) { setSeedMsg({ type: "err", text: "Garden is full! Harvest first." }); return; }
                  if (parseFloat(seedAmount) > parseFloat(usdcBalance || "0")) { setSeedMsg({ type: "err", text: "Insufficient balance" }); return; }
                  setSeeds(prev => [...prev, { amount: seedAmount, plantedAt: Date.now() }]);
                  setSeedAmount("");
                  setSeedMsg({ type: "ok", text: "Seed planted! Watch it grow." });
                  setTimeout(() => setSeedMsg(null), 3000);
                }} style={{ ...S.sendBtn, width: "auto", padding: "11px 20px", whiteSpace: "nowrap" as const }}>Plant seed</button>
              </div>
              {seedMsg && <div style={{ fontSize: 13, padding: "10px 14px", borderRadius: 10, background: seedMsg.type === "ok" ? "#e8f5e9" : "#fce8e8", color: seedMsg.type === "ok" ? "#2e7d32" : "#c62828", fontWeight: 600 }}>{seedMsg.text}</div>}
            </div>
            <div style={{ background: "#e8e6f8", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1b1464" }}>Need testnet USDC?</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Get free tokens from Arc Testnet faucet</div>
              </div>
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{ background: "#1b1464", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none" }}>Get tokens</a>
            </div>
          </div>
        )}

        {hasWallet && activeTab === "history" && (
          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={S.cardTitle}>Transaction history</div>
              <button onClick={() => primaryWallet && loginResult && loadTransactions(loginResult.userToken, primaryWallet.id)} style={{ background: "transparent", border: "1px solid #e5e3ed", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#888", cursor: "pointer" }}>Refresh</button>
            </div>
            {txLoading ? (
              <div style={{ padding: "32px 0", textAlign: "center", color: "#bbb", fontSize: 14 }}>Loading...</div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center", color: "#bbb", fontSize: 14, fontWeight: 500 }}>No transactions yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {transactions.map((tx: any, i: number) => {
                  const isIn = tx.transactionType === "INBOUND";
                  const amount = tx.amounts?.[0] || "0";
                  const addr = isIn ? tx.sourceAddress : tx.destinationAddress;
                  const date = tx.createDate ? new Date(tx.createDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f0eff5" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: isIn ? "#e8f5e9" : "#fce8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: isIn ? "#2e7d32" : "#c62828" }}>
                          <i className={isIn ? "ti ti-arrow-down" : "ti ti-arrow-up"} aria-hidden="true"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{isIn ? "Received" : "Sent"}</div>
                          <div style={{ fontSize: 11, color: "#bbb", fontFamily: "monospace" }}>{addr ? addr.slice(0,8) + "..." + addr.slice(-4) : "—"}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isIn ? "#2e7d32" : "#c62828" }}>{isIn ? "+" : "-"}{parseFloat(amount).toFixed(2)} USDC</div>
                        <div style={{ fontSize: 11, color: "#bbb" }}>{date}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
