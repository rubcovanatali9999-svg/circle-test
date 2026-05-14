"use client";

import { useEffect, useRef, useState } from "react";
import { setCookie, getCookie } from "cookies-next";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string;
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;

type LoginResult = {
  userToken: string;
  encryptionKey: string;
};

type Wallet = {
  id: string;
  address: string;
  blockchain: string;
  [key: string]: unknown;
};

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
  const [activeTab, setActiveTab] = useState<"dashboard" | "send" | "history">("dashboard");
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendChain, setSendChain] = useState("ETH");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{type:"ok"|"err", text:string}|null>(null);

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
          setStatus("Logged in with Google.");
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
      setStatus("Device token ready. Please sign in with Google.");
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
      setStatus("User initialized. Ready to create wallet.");
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

  const primaryWallet = wallets[0];
  const isLoggedIn = !!loginResult;
  const hasWallet = wallets.length > 0;

  const steps = [
    { label: "Create device token", done: !!deviceToken, action: handleCreateDeviceToken, disabled: !sdkReady || !deviceId || deviceIdLoading || !!deviceToken },
    { label: "Sign in with Google", done: isLoggedIn, action: handleLoginWithGoogle, disabled: !deviceToken || isLoggedIn },
    { label: "Initialize account", done: hasWallet || !!challengeId, action: handleInitializeUser, disabled: !isLoggedIn || hasWallet },
    { label: "Create wallet", done: hasWallet, action: handleExecuteChallenge, disabled: !challengeId || hasWallet },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f0f13" }}>
      <aside style={{ width: 220, background: "#16161d", borderRight: "0.5px solid #ffffff12", display: "flex", flexDirection: "column", padding: "24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 20px 28px" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#00D395", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#000" }}>C</div>
          <span style={{ fontSize: 15, fontWeight: 500, color: "#fff" }}>CircleWallet</span>
        </div>
        {(["dashboard", "send", "history"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 20px", fontSize: 13, color: activeTab === tab ? "#fff" : "#666", background: activeTab === tab ? "#ffffff0a" : "transparent", borderRight: activeTab === tab ? "2px solid #00D395" : "2px solid transparent", border: "none", textAlign: "left", cursor: "pointer" }}>
            {tab === "dashboard" && "Dashboard"}
            {tab === "send" && "Send"}
            {tab === "history" && "History"}
          </button>
        ))}
        <div style={{ marginTop: "auto", padding: "0 20px" }}>
          <div style={{ fontSize: 11, color: "#444", marginBottom: 6 }}>Status</div>
          <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{status}</div>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "#fff", textTransform: "capitalize" }}>{activeTab}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isLoggedIn && !hasWallet && (
              <button onClick={handleBack} style={{ background: "transparent", color: "#666", border: "0.5px solid #ffffff15", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>← Back</button>
            )}
            {loginResult && <div style={{ fontSize: 12, color: "#555", background: "#16161d", padding: "6px 12px", borderRadius: 20, border: "0.5px solid #ffffff10" }}>Connected</div>}
          </div>
        </div>

        {!hasWallet && (
          <div style={{ background: "#16161d", borderRadius: 12, border: "0.5px solid #ffffff10", padding: 24 }}>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Complete these steps to set up your wallet</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {steps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: step.done ? "#00D395" : "#ffffff10", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: step.done ? "#000" : "#666", fontWeight: 500, flexShrink: 0 }}>{step.done ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 13, color: step.done ? "#666" : "#ccc", flex: 1, textDecoration: step.done ? "line-through" : "none" }}>{step.label}</span>
                  {!step.done && (
                    <button onClick={step.action} disabled={step.disabled} style={{ background: step.disabled ? "#ffffff08" : "#00D395", color: step.disabled ? "#444" : "#000", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 500, cursor: step.disabled ? "not-allowed" : "pointer" }}>
                      {i === 1 ? "Sign in" : "Start"}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {loginError && <div style={{ marginTop: 12, fontSize: 12, color: "#ff6b6b", background: "#ff6b6b15", padding: "8px 12px", borderRadius: 8 }}>{loginError}</div>}
          </div>
        )}

        {hasWallet && activeTab === "dashboard" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "USDC Balance", value: usdcBalance ? parseFloat(usdcBalance).toFixed(2) : "0.00", sub: "Main wallet", subColor: "#00D395" },
                { label: "Blockchain", value: primaryWallet.blockchain, sub: "Network", subColor: "#888" },
                { label: "Status", value: "Active", sub: "Wallet ready", subColor: "#00D395" },
              ].map((m, i) => (
                <div key={i} style={{ background: "#16161d", borderRadius: 12, border: "0.5px solid #ffffff10", padding: 16 }}>
                  <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 500, color: "#fff" }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: m.subColor, marginTop: 4 }}>{m.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#16161d", borderRadius: 12, border: "0.5px solid #ffffff10", padding: 20 }}>
              <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 12 }}>Wallet address</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "#aaa", wordBreak: "break-all", marginBottom: 16 }}>{primaryWallet.address}</div>
              <button onClick={() => navigator.clipboard.writeText(primaryWallet.address)} style={{ background: "#ffffff0a", color: "#ccc", border: "0.5px solid #ffffff15", borderRadius: 8, padding: "8px 16px", fontSize: 12 }}>Copy address</button>
            </div>
          </>
        )}

        {hasWallet && activeTab === "send" && (
          <div style={{ background: "#16161d", borderRadius: 12, border: "0.5px solid #ffffff10", padding: 24, maxWidth: 480 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 20 }}>Send USDC</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>Recipient address</label>
                <input value={sendAddress} onChange={e => setSendAddress(e.target.value)} placeholder="0x..." style={{ width: "100%", background: "#0f0f13", border: "0.5px solid #ffffff15", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#fff", outline: "none" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>Amount (USDC)</label>
                  <input value={sendAmount} onChange={e => setSendAmount(e.target.value)} type="number" placeholder="0.00" style={{ width: "100%", background: "#0f0f13", border: "0.5px solid #ffffff15", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#fff", outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>Network</label>
                  <select value={sendChain} onChange={e => setSendChain(e.target.value)} style={{ width: "100%", background: "#0f0f13", border: "0.5px solid #ffffff15", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#fff", outline: "none" }}>
                    <option value="ETH">Ethereum</option>
                    <option value="MATIC">Polygon</option>
                    <option value="SOL">Solana</option>
                    <option value="ARB">Arbitrum</option>
                  </select>
                </div>
              </div>
              <button disabled={sending || !sendAddress || !sendAmount} onClick={async () => {
                setSending(true); setSendMsg(null);
                try {
                  const res = await fetch("/api/endpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "getTransferChallenge", userToken: loginResult?.userToken, walletId: primaryWallet?.id, destinationAddress: sendAddress, amount: sendAmount }) });
                  const data = await res.json();
                  if (!res.ok) { setSendMsg({ type: "err", text: data.message || "Failed to send" }); setSending(false); return; }
                  const sdk = sdkRef.current;
                  if (!sdk || !data.challengeId) { setSendMsg({ type: "err", text: "No challenge ID returned" }); setSending(false); return; }
                  sdk.setAuthentication({ userToken: loginResult!.userToken, encryptionKey: loginResult!.encryptionKey });
                  sdk.execute(data.challengeId, async (error) => {
                    if (error) { setSendMsg({ type: "err", text: "Transaction rejected: " + (error as any)?.message }); }
                    else { setSendMsg({ type: "ok", text: "Transaction confirmed!" }); setSendAddress(""); setSendAmount(""); if (loginResult?.userToken) await loadWallets(loginResult.userToken); }
                    setSending(false);
                  });
                } catch { setSendMsg({ type: "err", text: "Network error" }); setSending(false); }
              }} style={{ background: sending || !sendAddress || !sendAmount ? "#ffffff10" : "#00D395", color: sending || !sendAddress || !sendAmount ? "#444" : "#000", border: "none", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                {sending ? "Sending..." : "Send USDC"}
              </button>
              {sendMsg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 8, background: sendMsg.type === "ok" ? "#00D39520" : "#ff6b6b15", color: sendMsg.type === "ok" ? "#00D395" : "#ff6b6b" }}>{sendMsg.text}</div>}
            </div>
          </div>
        )}

        {hasWallet && activeTab === "history" && (
          <div style={{ background: "#16161d", borderRadius: 12, border: "0.5px solid #ffffff10", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #ffffff08", fontSize: 14, fontWeight: 500, color: "#fff" }}>Transaction history</div>
            <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: 13 }}>No transactions yet. Send USDC to get started.</div>
          </div>
        )}
      </main>
    </div>
  );
}
