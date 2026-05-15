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
  const [activeTab, setActiveTab] = useState<"dashboard" | "send" | "receive" | "swap" | "garden" | "analytics" | "achievements" | "learn" | "history">("dashboard");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"7D"|"1M"|"ALL">("7D");
  const [eurcBalance, setEurcBalance] = useState<string>("20.00");

  useEffect(() => {
    const savedUserToken = getCookie("userToken") as string;
    if (savedUserToken && wallets.length === 0) {
      void loadWallets(savedUserToken);
    }
  }, [sdkReady]);
  const [swapFrom, setSwapFrom] = useState<"USDC"|"EURC">("USDC");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapMsg, setSwapMsg] = useState<{type:"ok"|"err", text:string}|null>(null);
  const [swapping, setSwapping] = useState(false);
  const [seeds, setSeeds] = useState<{amount: string; plantedAt: number}[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("garden_seeds");
      if (saved) return JSON.parse(saved);
    }
    return [];
  });
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
          setCookie("userToken", result.userToken);
          setCookie("encryptionKey", result.encryptionKey);
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
        const savedUserToken = getCookie("userToken") as string;
        const savedEncryptionKey = getCookie("encryptionKey") as string;
        if (savedUserToken && savedEncryptionKey) {
          setLoginResult({ userToken: savedUserToken, encryptionKey: savedEncryptionKey });
          setStatus("Restoring session...");
        }
        if (!cancelled) { setSdkReady(true); setStatus(savedUserToken ? "Session restored." : "Ready"); }
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

  useEffect(() => {
    const savedUserToken = getCookie("userToken") as string;
    if (savedUserToken && sdkReady) {
      void loadWallets(savedUserToken);
    }
  }, [sdkReady]);

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

  useEffect(() => {
    if (activeTab !== "analytics") return;
    const timer = setTimeout(() => {
      const canvas = document.getElementById("analyticsChart") as HTMLCanvasElement;
      if (!canvas) return;
      const existing = (canvas as any)._chartInstance;
      if (existing) existing.destroy();
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js";
      script.onload = () => {
        const Chart = (window as any).Chart;
        const labels = { "7D": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], "1M": ["W1","W2","W3","W4"], "ALL": ["Jan","Feb","Mar","Apr","May"] };
        const data = { "7D": [20,40,30,60,45,70,parseFloat(usdcBalance||"0")], "1M": [10,30,50,parseFloat(usdcBalance||"0")], "ALL": [0,10,30,50,parseFloat(usdcBalance||"0")] };
        const instance = new Chart(canvas.getContext("2d"), {
          type: "line",
          data: {
            labels: labels[analyticsPeriod],
            datasets: [{ data: data[analyticsPeriod], borderColor: "#a855f7", backgroundColor: "rgba(168,85,247,0.12)", fill: true, tension: 0.4, pointBackgroundColor: "#a855f7", pointBorderColor: "#fff", pointBorderWidth: 2, pointRadius: 5 }]
          },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { color: "#ffffff08" }, ticks: { color: "#ffffff30", font: { size: 11 } } }, y: { grid: { color: "#ffffff08" }, ticks: { color: "#ffffff30", font: { size: 11 } } } } }
        });
        (canvas as any)._chartInstance = instance;
      };
      if (!(window as any).Chart) document.head.appendChild(script);
      else script.onload?.(new Event("load"));
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab, analyticsPeriod, usdcBalance]);

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
    { id: "swap", label: "Swap", icon: "ti-arrows-right-left" },
    { id: "garden", label: "Garden", icon: "ti-plant" },
    { id: "analytics", label: "Analytics", icon: "ti-chart-line" },
    { id: "achievements", label: "Achievements", icon: "ti-trophy" },
    { id: "learn", label: "Learn", icon: "ti-book" },
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

        {hasWallet && activeTab === "swap" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}>
            <div style={S.card}>
              <div style={S.cardTitle}>Swap tokens</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "#f8f7fc", borderRadius: 12, padding: 16, border: "1px solid #e5e3ed" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 8 }}>From</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1b1464", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800 }}>{swapFrom === "USDC" ? "$" : "€"}</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>{swapFrom}</div>
                        <div style={{ fontSize: 11, color: "#bbb" }}>Balance: {swapFrom === "USDC" ? parseFloat(usdcBalance || "0").toFixed(2) : parseFloat(eurcBalance).toFixed(2)}</div>
                      </div>
                    </div>
                    <input value={swapAmount} onChange={e => setSwapAmount(e.target.value)} type="number" placeholder="0.00" style={{ background: "transparent", border: "none", outline: "none", fontSize: 22, fontWeight: 800, color: "#1a1a2e", textAlign: "right" as const, width: 120 }} />
                  </div>
                </div>
                <button onClick={() => setSwapFrom(prev => prev === "USDC" ? "EURC" : "USDC")} style={{ alignSelf: "center", background: "#e8e6f8", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#1b1464", fontSize: 16 }}>
                  <i className="ti ti-arrows-up-down" aria-hidden="true"></i>
                </button>
                <div style={{ background: "#f8f7fc", borderRadius: 12, padding: 16, border: "1px solid #e5e3ed" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 8 }}>To</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2e7d32", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800 }}>{swapFrom === "USDC" ? "€" : "$"}</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>{swapFrom === "USDC" ? "EURC" : "USDC"}</div>
                        <div style={{ fontSize: 11, color: "#bbb" }}>Balance: {swapFrom === "USDC" ? parseFloat(eurcBalance).toFixed(2) : parseFloat(usdcBalance || "0").toFixed(2)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#2e7d32" }}>{swapAmount ? (parseFloat(swapAmount) * (swapFrom === "USDC" ? 0.92 : 1.09)).toFixed(2) : "0.00"}</div>
                  </div>
                </div>
                {swapAmount && parseFloat(swapAmount) > 0 && (
                  <div style={{ background: "#f8f7fc", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#888" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>Rate</span>
                      <span style={{ fontWeight: 700, color: "#1a1a2e" }}>1 {swapFrom} = {swapFrom === "USDC" ? "0.92 EURC" : "1.09 USDC"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Fee</span>
                      <span style={{ fontWeight: 700, color: "#1a1a2e" }}>0.00 (testnet)</span>
                    </div>
                  </div>
                )}
                <button disabled={swapping || !swapAmount || parseFloat(swapAmount) <= 0} onClick={async () => {
                  setSwapping(true); setSwapMsg(null);
                  await new Promise(r => setTimeout(r, 1500));
                  const amt = parseFloat(swapAmount);
                  const received = (amt * (swapFrom === "USDC" ? 0.92 : 1.09)).toFixed(2);
                  if (swapFrom === "USDC") {
                    setUsdcBalance(prev => (parseFloat(prev || "0") - amt).toFixed(2));
                    setEurcBalance(prev => (parseFloat(prev) + parseFloat(received)).toFixed(2));
                  } else {
                    setEurcBalance(prev => (parseFloat(prev) - amt).toFixed(2));
                    setUsdcBalance(prev => (parseFloat(prev || "0") + parseFloat(received)).toFixed(2));
                  }
                  setSwapMsg({ type: "ok", text: `Swapped ${amt.toFixed(2)} ${swapFrom} for ${received} ${swapFrom === "USDC" ? "EURC" : "USDC"}!` });
                  setSwapAmount("");
                  setSwapping(false);
                }} style={{ ...S.sendBtn, opacity: swapping || !swapAmount || parseFloat(swapAmount) <= 0 ? 0.5 : 1, cursor: swapping || !swapAmount ? "not-allowed" : "pointer" }}>
                  {swapping ? "Swapping..." : "Swap now"}
                </button>
                {swapMsg && <div style={{ fontSize: 13, padding: "10px 14px", borderRadius: 10, background: swapMsg.type === "ok" ? "#e8f5e9" : "#fce8e8", color: swapMsg.type === "ok" ? "#2e7d32" : "#c62828", fontWeight: 600 }}>{swapMsg.text}</div>}
              </div>
            </div>
            <div style={{ background: "#e8e6f8", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1b1464", marginBottom: 4 }}>Your balances</div>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ fontSize: 13, color: "#888" }}>USDC: <span style={{ fontWeight: 800, color: "#1b1464" }}>{parseFloat(usdcBalance || "0").toFixed(2)}</span></div>
                <div style={{ fontSize: 13, color: "#888" }}>EURC: <span style={{ fontWeight: 800, color: "#2e7d32" }}>{parseFloat(eurcBalance).toFixed(2)}</span></div>
              </div>
            </div>
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
                      <button onClick={() => { setSeeds(prev => { const next = prev.filter((_, j) => j !== i); localStorage.setItem("garden_seeds", JSON.stringify(next)); return next; }); setSeedMsg({ type: "ok", text: "Harvested " + parseFloat(seed.amount).toFixed(2) + " USDC!" }); setTimeout(() => setSeedMsg(null), 3000); }} style={{ marginTop: 8, background: "#1b1464", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Harvest</button>
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
                  setSeeds(prev => {
                    const next = [...prev, { amount: seedAmount, plantedAt: Date.now() }];
                    localStorage.setItem("garden_seeds", JSON.stringify(next));
                    return next;
                  });
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

        {hasWallet && activeTab === "analytics" && (() => {
          const txData = transactions.slice().reverse();
          const labels7 = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
          const labels1M = ["W1","W2","W3","W4"];
          const labels = analyticsPeriod === "7D" ? labels7 : analyticsPeriod === "1M" ? labels1M : ["Jan","Feb","Mar","Apr","May"];
          const totalTx = transactions.length;
          const totalSent = transactions.filter(t => t.transactionType === "OUTBOUND").reduce((a,t) => a + parseFloat(t.amounts?.[0] || "0"), 0);
          const totalReceived = transactions.filter(t => t.transactionType === "INBOUND").reduce((a,t) => a + parseFloat(t.amounts?.[0] || "0"), 0);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "#0f0e1a", borderRadius: 16, padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Balance history</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["7D","1M","ALL"] as const).map(p => (
                      <button key={p} onClick={() => setAnalyticsPeriod(p)} style={{ background: analyticsPeriod === p ? "#7c3aed" : "transparent", border: `1px solid ${analyticsPeriod === p ? "#7c3aed" : "#ffffff15"}`, color: analyticsPeriod === p ? "#fff" : "#ffffff50", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{p}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Balance", value: parseFloat(usdcBalance || "0").toFixed(2) + " USDC", change: "+12.5 this week", changeColor: "#a855f7" },
                    { label: "Sent", value: totalSent.toFixed(2) + " USDC", change: totalTx + " transactions", changeColor: "#ffffff30" },
                    { label: "Received", value: totalReceived.toFixed(2) + " USDC", change: "Total received", changeColor: "#a855f7" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "#ffffff06", borderRadius: 12, padding: 14, border: "1px solid #ffffff08" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#ffffff35", textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 6 }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: s.changeColor, marginTop: 4, fontWeight: 600 }}>{s.change}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#ffffff04", borderRadius: 12, padding: 16, border: "1px solid #ffffff08" }}>
                  <canvas id="analyticsChart" height="160"></canvas>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                  <div style={{ background: "#ffffff06", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 12, border: "1px solid #ffffff08" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>$</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>USDC</div>
                      <div style={{ fontSize: 12, color: "#ffffff35", marginTop: 2 }}>{parseFloat(usdcBalance || "0").toFixed(2)} available</div>
                    </div>
                  </div>
                  <div style={{ background: "#ffffff06", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 12, border: "1px solid #ffffff08" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2e7d32", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>€</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>EURC</div>
                      <div style={{ fontSize: 12, color: "#ffffff35", marginTop: 2 }}>{parseFloat(eurcBalance).toFixed(2)} available</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {hasWallet && activeTab === "achievements" && (() => {
          const hasSent = transactions.some(t => t.transactionType === "OUTBOUND");
          const hasReceived = transactions.some(t => t.transactionType === "INBOUND");
          const hasStaked = seeds.length > 0;
          const hasSwapped = parseFloat(eurcBalance) !== 20;
          const isWhale = parseFloat(usdcBalance || "0") >= 100;
          const hasGarden = seeds.length >= 3;
          const achievements = [
            { icon: "💸", title: "First Send", desc: "Send your first USDC transaction", done: hasSent },
            { icon: "📥", title: "First Receive", desc: "Receive USDC for the first time", done: hasReceived },
            { icon: "🌱", title: "First Stake", desc: "Plant your first seed in the garden", done: hasStaked },
            { icon: "🔄", title: "Swapper", desc: "Swap USDC for EURC or vice versa", done: hasSwapped },
            { icon: "🌸", title: "Green Thumb", desc: "Grow 3 plants in your garden", done: hasGarden },
            { icon: "🐋", title: "Whale", desc: "Hold more than 100 USDC", done: isWhale },
          ];
          const earned = achievements.filter(a => a.done).length;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={S.card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 6 }}>Earned</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#1b1464" }}>{earned} / {achievements.length}</div>
                </div>
                <div style={S.card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#bbb", textTransform: "uppercase" as const, letterSpacing: ".06em", marginBottom: 6 }}>Progress</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#1b1464" }}>{Math.round(earned / achievements.length * 100)}%</div>
                  <div style={{ marginTop: 8, height: 6, background: "#f0eff5", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round(earned / achievements.length * 100)}%`, background: "#1b1464", borderRadius: 3 }}></div>
                  </div>
                </div>
              </div>
              <div style={S.card}>
                <div style={S.cardTitle}>Your achievements</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {achievements.map((a, i) => (
                    <div key={i} style={{ background: a.done ? "#e8e6f8" : "#f8f7fc", borderRadius: 12, border: `1px solid ${a.done ? "#c8c5e8" : "#e5e3ed"}`, padding: 16, opacity: a.done ? 1 : 0.5 }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{a.done ? a.icon : "🔒"}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: a.done ? "#1b1464" : "#888", marginBottom: 4 }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: a.done ? "#534AB7" : "#bbb", fontWeight: 500 }}>{a.desc}</div>
                      {a.done && <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: "#1b1464", background: "#fff", padding: "3px 8px", borderRadius: 20, display: "inline-block" }}>Earned!</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {hasWallet && activeTab === "learn" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#1b1464", borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <img src="https://community.arc.io/rails/active_storage/representations/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBbVFDIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--b54b2f3d2f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f/arc-logo.png" alt="Arc" style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", objectFit: "contain" as const }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Arc House</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>Builder community by Circle</div>
                </div>
              </div>
              <a href="https://community.arc.io" target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "#fff", textDecoration: "none", background: "rgba(255,255,255,0.15)", padding: "7px 14px", borderRadius: 8 }}>View all →</a>
            </div>
            <div style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>Latest from Arc House community</div>
            {[
              { title: "Circle Developer Grants Program Relaunches", desc: "Circle Developer Grant applications are now open. Learn how to apply and get funded for your project.", tags: ["ARC BUILDER FUND", "FUNDING", "OPPORTUNITIES"], author: "Jenna Teeman & Anthony Kelani", date: "May 14, 2026", likes: 183, comments: 92, url: "https://community.arc.io/public/blogs/circle-developer-grants-program-relaunches-2026-05-14" },
              { title: "Circle Developer Grants: From idea to funded", desc: "What are the leading developer grant abilities for builders on Arc? A complete guide to getting backed.", tags: ["CIRCLE DEVELOPER GRANTS", "DEVELOPER"], author: "Jenna Teeman, Anthony Kelani & David Shamash", date: "May 14, 2026", likes: 45, comments: 12, url: "https://arc.house" },
              { title: "Getting Started with USDC on ARC Testnet", desc: "Learn how to build with USDC stablecoins on the ARC blockchain testnet environment.", tags: ["USDC", "DEVELOPER QUICKSTARTS", "ARC"], author: "Arc Team", date: "May 10, 2026", likes: 210, comments: 34, url: "https://arc.house" },
              { title: "Stablecoin 101: Everything you need to know", desc: "A beginner-friendly guide to stablecoins — what they are, how they work, and why they matter.", tags: ["STABLECOIN 101", "USDC", "AI"], author: "Arc Team", date: "May 8, 2026", likes: 156, comments: 28, url: "https://arc.house" },
              { title: "Building Agentic Commerce with Circle Wallets", desc: "Explore how autonomous agents can use Circle wallets to transact on behalf of users.", tags: ["AGENTIC COMMERCE", "CIRCLE WALLETS", "AI"], author: "Arc Team", date: "May 5, 2026", likes: 89, comments: 17, url: "https://arc.house" },
              { title: "Dev-Controlled Wallets: A Deep Dive", desc: "Understand the difference between user-controlled and dev-controlled wallets and when to use each.", tags: ["DEV-CONTROLLED WALLETS", "DEVELOPER TOOLS"], author: "Arc Team", date: "May 1, 2026", likes: 134, comments: 41, url: "https://arc.house" },
            ].map((article, i) => (
              <a key={i} href={article.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ ...S.card, cursor: "pointer", transition: "border-color .2s" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e", marginBottom: 6, lineHeight: 1.4 }}>{article.title}</div>
                      <div style={{ fontSize: 13, color: "#888", marginBottom: 12, lineHeight: 1.5, fontWeight: 500 }}>{article.desc}</div>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 12 }}>
                        {article.tags.map((tag, j) => (
                          <span key={j} style={{ fontSize: 10, fontWeight: 700, background: "#e8e6f8", color: "#1b1464", padding: "3px 8px", borderRadius: 20, letterSpacing: ".04em" }}>{tag}</span>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 11, color: "#bbb", fontWeight: 500 }}>{article.author} · {article.date}</div>
                        <div style={{ display: "flex", gap: 12 }}>
                          <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}><i className="ti ti-thumb-up" aria-hidden="true"></i> {article.likes}</span>
                          <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}><i className="ti ti-message" aria-hidden="true"></i> {article.comments}</span>
                        </div>
                      </div>
                    </div>
                    <i className="ti ti-external-link" aria-hidden="true" style={{ fontSize: 16, color: "#bbb", flexShrink: 0, marginTop: 2 }}></i>
                  </div>
                </div>
              </a>
            ))}
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
