"use client";

import { useEffect, useRef, useState } from "react";
import { setCookie, getCookie } from "cookies-next";
import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import WalletConnect from "./WalletConnect";
import { useEvmWallet } from "./useEvmWallet";
import { useBridgeKit, BRIDGE_TESTNET_CHAINS } from "./useBridgeKit";
import { useBadges, BADGES } from "./useBadges";

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
  const [activeTab, setActiveTab] = useState<"dashboard" | "bridge" | "treasury" | "achievements" | "ai" | "learn" | "history" | "about">("dashboard");
  const [rules, setRules] = useState<{id:number; type:string; threshold:string; action:string; amount:string; address:string; active:boolean}[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("treasury_rules");
      if (saved) return JSON.parse(saved);
    }
    return [];
  });
  const [ruleType, setRuleType] = useState("above");
  const [ruleThreshold, setRuleThreshold] = useState("");
  const [ruleAction, setRuleAction] = useState("stake");
  const [ruleAmount, setRuleAmount] = useState("");
  const [ruleAddress, setRuleAddress] = useState("");
  const [ruleMsg, setRuleMsg] = useState<{type:"ok"|"err", text:string}|null>(null);
  const [aiMessages, setAiMessages] = useState<{role:"user"|"ai", text:string}[]>([{ role: "ai", text: "Hello! 👋 I'm HashCrew AI, your Web3 assistant. Ask me anything about USDC, Arc, staking or swapping!" }]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"7D"|"1M"|"ALL">("7D");
  const [eurcBalance, setEurcBalance] = useState<string>("20.00");
  const evm = useEvmWallet();
  const bridgeKit = useBridgeKit();
  const badges = useBadges();
  const [bridgeFrom, setBridgeFrom] = useState("Ethereum_Sepolia");
  const [bridgeTo, setBridgeTo] = useState("Arc_Testnet");
  const [bridgeAmount, setBridgeAmount] = useState("");

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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [signingIn, setSigningIn] = useState(false);
  const autoInitRef = useRef(false);
  const prefetchRef = useRef(false);
  const autoExecRef = useRef(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    if (saved === "light" || saved === "dark") { setTheme(saved); return; }
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") window.localStorage.setItem("theme", next);
      return next;
    });
  };

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
            setDeviceToken("");
            setDeviceEncryptionKey("");
            setCookie("deviceToken", "");
            setCookie("deviceEncryptionKey", "");
            prefetchRef.current = false;
            setSigningIn(false);
            if (typeof window !== "undefined") window.sessionStorage.removeItem("signinPending");
            return;
          }
          setLoginResult({ userToken: result.userToken, encryptionKey: result.encryptionKey });
          setCookie("userToken", result.userToken);
          setCookie("encryptionKey", result.encryptionKey);
          setLoginError(null);
          setStatus("Logged in.");
          setSigningIn(false);
          if (typeof window !== "undefined") window.sessionStorage.removeItem("signinPending");
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
        if (restoredDeviceToken) setDeviceToken(restoredDeviceToken);
        if (restoredDeviceEncryptionKey) setDeviceEncryptionKey(restoredDeviceEncryptionKey);
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

  const handleCreateDeviceToken = async (): Promise<{ deviceToken: string; deviceEncryptionKey: string } | null> => {
    if (!deviceId) return null;
    setStatus("Creating device token...");
    try {
      const response = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDeviceToken", deviceId }),
      });
      const data = await response.json();
      if (!response.ok) { setStatus("Failed to create device token"); return null; }
      setDeviceToken(data.deviceToken);
      setDeviceEncryptionKey(data.deviceEncryptionKey);
      setCookie("deviceToken", data.deviceToken);
      setCookie("deviceEncryptionKey", data.deviceEncryptionKey);
      setStatus("Device token ready.");
      return { deviceToken: data.deviceToken, deviceEncryptionKey: data.deviceEncryptionKey };
    } catch { setStatus("Failed to create device token"); return null; }
  };

  const startGoogleSignIn = () => {
    const sdk = sdkRef.current;
    if (!sdk || !deviceToken || !deviceEncryptionKey || signingIn) return;
    setSigningIn(true);
    setLoginError(null);

    setCookie("appId", appId);
    setCookie("google.clientId", googleClientId);
    sdk.updateConfigs({
      appSettings: { appId },
      loginConfigs: {
        deviceToken,
        deviceEncryptionKey,
        google: { clientId: googleClientId, redirectUri: window.location.origin, selectAccountPrompt: true },
      },
    });
    setStatus("Opening Google...");
    if (typeof window !== "undefined") window.sessionStorage.setItem("signinPending", "1");
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
    autoInitRef.current = false;
    autoExecRef.current = false;
    prefetchRef.current = false;
    setSigningIn(false);
    if (typeof window !== "undefined") window.sessionStorage.removeItem("signinPending");
    setLoginResult(null);
    setDeviceToken("");
    setDeviceEncryptionKey("");
    setChallengeId(null);
    setLoginError(null);
    setStatus("Ready");
  };

  const handleSendUsdc = async () => {
    setSending(true); setSendMsg(null);

    if (walletMode === "evm") {
      try {
        await evm.sendUsdc(sendAddress, sendAmount);
        setSendMsg({ type: "ok", text: "Transaction submitted! Confirming on-chain..." });
        setSendAddress(""); setSendAmount("");
        await evm.refetchBalance();
      } catch (err: any) {
        setSendMsg({ type: "err", text: err?.shortMessage || err?.message || "Transaction rejected" });
      }
      setSending(false);
      return;
    }

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
    if (activeTab !== "dashboard") return;
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

  const hasCircleWallet = wallets.length > 0;
  const evmActive = !hasCircleWallet && evm.isConnected && evm.isArc;
  const walletMode: "circle" | "evm" | null = hasCircleWallet ? "circle" : evmActive ? "evm" : null;
  const primaryWallet: Wallet = hasCircleWallet
    ? wallets[0]
    : evmActive && evm.address
      ? { id: "", address: evm.address, blockchain: evm.chainName ?? "Arc Testnet" }
      : (undefined as unknown as Wallet);
  const isLoggedIn = !!loginResult;
  const hasWallet = hasCircleWallet || evmActive;

  useEffect(() => {
    if (walletMode === "evm") setUsdcBalance(evm.balance);
    else if (walletMode === null) setUsdcBalance(null);
  }, [walletMode, evm.balance]);

  useEffect(() => {
    if (walletMode !== "evm" || !evm.address) return;
    setTxLoading(true);
    evm.loadEvmHistory(evm.address)
      .then((txs) => setTransactions(txs))
      .catch(() => setTransactions([]))
      .finally(() => setTxLoading(false));
  }, [walletMode, evm.address]);

  useEffect(() => {
    if (!sdkReady || !deviceId || deviceIdLoading) return;
    if (deviceToken || isLoggedIn || hasWallet) return;
    if (typeof window !== "undefined" && window.sessionStorage.getItem("signinPending")) return;
    if (prefetchRef.current) return;
    prefetchRef.current = true;
    void handleCreateDeviceToken().then((creds) => {
      if (!creds) prefetchRef.current = false;
      else setStatus("Ready to sign in.");
    });
  }, [sdkReady, deviceId, deviceIdLoading, deviceToken, isLoggedIn, hasWallet]);

  useEffect(() => {
    if (!loginResult || hasWallet || challengeId) return;
    if (autoInitRef.current) return;
    autoInitRef.current = true;
    void handleInitializeUser();
  }, [loginResult, hasWallet, challengeId]);

  useEffect(() => {
    if (!challengeId || !loginResult || hasWallet) return;
    if (autoExecRef.current) return;
    autoExecRef.current = true;
    handleExecuteChallenge();
  }, [challengeId, loginResult, hasWallet]);


  const nav = [
    { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
    { id: "bridge", label: "Bridge", icon: "ti-arrows-exchange" },
    { id: "treasury", label: "Treasury", icon: "ti-building-bank" },
    { id: "achievements", label: "Achievements", icon: "ti-trophy" },
    { id: "ai", label: "AI Assistant", icon: "ti-robot" },
    { id: "learn", label: "Learn", icon: "ti-book" },
    { id: "history", label: "History", icon: "ti-list" },
    { id: "about", label: "About", icon: "ti-info-circle" },
  ] as const;

  const visibleNav = nav;

  const C = theme === "dark"
    ? { bg: "#0d0b18", surf: "#17142a", sub: "#1e1a35", bd: "#2b2646", tx: "#f4f3f9", sec: "#9a95b8", mut: "#6f6a8f", ac: "#afa9ec", acSoft: "#241f4d", brand: "#15122b", onBrand: "#ffffff", shadow: "0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.35)", grad: "linear-gradient(120deg, #8b7bf7 0%, #5b8cf5 100%)", glow: "0 8px 24px rgba(107,109,244,.35)", badgeGrad: "linear-gradient(135deg, rgba(139,123,247,.22), rgba(91,140,245,.22))" }
    : { bg: "#f7f5fc", surf: "#ffffff", sub: "#f4f2fc", bd: "#eae6f7", tx: "#26215c", sec: "#8b87a8", mut: "#a7a3bf", ac: "#534ab7", acSoft: "#eeedfe", brand: "#15122b", onBrand: "#ffffff", shadow: "0 1px 2px rgba(38,33,92,.05), 0 8px 24px rgba(38,33,92,.07)", grad: "linear-gradient(120deg, #7c6fee 0%, #4f8cff 100%)", glow: "0 8px 20px rgba(83,74,183,.25)", badgeGrad: "linear-gradient(135deg, rgba(124,111,238,.12), rgba(79,140,255,.12))" };

  const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

  const S = {
    app: { display: "flex", flexDirection: "column" as const, minHeight: "100vh", background: C.bg } as React.CSSProperties,
    topbar: { background: C.surf, borderBottom: `0.5px solid ${C.bd}`, position: "sticky" as const, top: 0, zIndex: 20 },
    micro: { fontFamily: MONO, fontSize: 11, color: C.sec, letterSpacing: ".06em" } as React.CSSProperties,
    topbarRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 28px", maxWidth: 1280, margin: "0 auto", width: "100%" },
    tabstrip: { display: "flex", gap: 2, padding: "0 20px", maxWidth: 1280, margin: "0 auto", width: "100%", overflowX: "auto" as const, scrollbarWidth: "none" as const },
    ghostBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.bd}`, color: C.sec, borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const },
    logo: { display: "flex", alignItems: "center", gap: 10, padding: "0 18px 28px" },
    logoIcon: { width: 34, height: 34, borderRadius: "50%", background: C.grad, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, boxShadow: C.glow },
    logoText: { fontSize: 15, fontWeight: 800, color: C.ac, letterSpacing: "-0.3px" },
    main: { flex: 1, padding: "28px 28px 40px", maxWidth: 1280, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column" as const, gap: 20 },
    balCard: { background: C.brand, borderRadius: 20, padding: "28px 26px", color: C.onBrand, boxShadow: C.shadow },
    balLabel: { fontSize: 11, fontWeight: 700, opacity: .6, textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 },
    balAmount: { fontSize: 38, fontWeight: 800, letterSpacing: "-1.5px", marginBottom: 4 },
    balUsd: { fontSize: 14, opacity: .6 },
    balActions: { display: "flex", gap: 10, marginTop: 20 },
    balBtn: { background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
    balBtnPrimary: { background: C.onBrand, border: "none", color: C.brand, borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
    card: { background: C.surf, borderRadius: 16, border: `1px solid ${C.bd}`, padding: 20, boxShadow: C.shadow },
    cardTitle: { fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 16 },
    input: { width: "100%", background: C.sub, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, color: C.tx, outline: "none" },
    sendBtn: { width: "100%", background: C.grad, color: "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: C.glow },
  };

  return (
    <div style={S.app}>
      <style>{`
        @keyframes hcPulse { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        .hc-dash-grid { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }
        @media (max-width: 860px) { .hc-dash-grid { grid-template-columns: 1fr; } }

        @keyframes hcAurora { 0%,100% { opacity: .85; transform: translateX(-50%) scale(1); } 50% { opacity: 1; transform: translateX(-50%) scale(1.1); } }
        @keyframes hcAurora2 { 0%,100% { opacity: .5; transform: translate(20%, -10%) scale(1); } 50% { opacity: .8; transform: translate(20%, -10%) scale(1.15); } }
        @keyframes hcFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .hc-landing { position: relative; display: flex; justify-content: center; padding: 68px 20px 44px; overflow: visible; border-radius: 28px; background: radial-gradient(120% 100% at 50% -10%, #211c42 0%, #0a0818 55%); isolation: isolate; }
        .hc-landing-glow { position: absolute; top: -160px; left: 50%; width: 620px; height: 620px; background: radial-gradient(circle, rgba(147,124,255,.65) 0%, rgba(79,140,255,.32) 45%, transparent 72%); filter: blur(50px); animation: hcAurora 9s ease-in-out infinite; pointer-events: none; z-index: 0; }
        .hc-landing-glow2 { position: absolute; top: 40px; right: -80px; width: 360px; height: 360px; background: radial-gradient(circle, rgba(79,200,255,.35) 0%, transparent 70%); filter: blur(60px); animation: hcAurora2 11s ease-in-out infinite; pointer-events: none; z-index: 0; }
        .hc-landing-content { position: relative; z-index: 1; width: 100%; max-width: 440px; animation: hcFadeUp .5s ease both; }
        .hc-landing-title { font-size: 58px; font-weight: 800; letter-spacing: -2.6px; line-height: .98; margin: 0 0 12px; background: linear-gradient(120deg, #e4defe 0%, #a99bff 38%, #6fa8ff 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
        @media (max-width: 520px) { .hc-landing-title { font-size: 42px; letter-spacing: -1.6px; } .hc-landing-glow { width: 420px; height: 420px; top: -120px; } }
        .hc-landing-cta { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
        .hc-landing-cta:hover:not(:disabled) { transform: translateY(-2px); }
      `}</style>
      <header style={S.topbar}>
        <div style={S.topbarRow}>

          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={S.logoIcon}>H</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, letterSpacing: "-0.3px", lineHeight: 1.1 }}>HashCrew</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.sec, marginTop: 2, letterSpacing: ".04em" }}>BUILT ON ARC &middot; POWERED BY CIRCLE</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, background: C.badgeGrad, color: C.ac, padding: "6px 12px", borderRadius: 20, letterSpacing: ".04em", whiteSpace: "nowrap" }}>ARC TESTNET</span>

            <button onClick={toggleTheme} aria-label="Toggle theme" style={S.ghostBtn}>
              <i className={`ti ${theme === "dark" ? "ti-sun" : "ti-moon"}`} aria-hidden="true" style={{ fontSize: 15 }}></i>
              {theme === "dark" ? "Light" : "Dark"}
            </button>

            {hasWallet && <WalletConnect />}

            {isLoggedIn && (
              <button onClick={() => {
                  setLoginResult(null);
                  setWallets([]);
                  setUsdcBalance(null);
                  setDeviceToken("");
                  setDeviceEncryptionKey("");
                  setChallengeId(null);
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem("deviceId");
                    window.sessionStorage.removeItem("signinPending");
                    document.cookie = "userToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                    document.cookie = "encryptionKey=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                    document.cookie = "deviceToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                    document.cookie = "deviceEncryptionKey=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                  }
                  setStatus("Signed out");
                }} style={{ ...S.ghostBtn, color: "#c62828", borderColor: "#f0c9c9" }}>
                <i className="ti ti-logout" aria-hidden="true" style={{ fontSize: 15 }}></i>
                Sign out
              </button>
            )}
          </div>

        </div>

        {hasWallet && (
          <nav style={S.tabstrip}>
            {visibleNav.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "13px 14px",
                  fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
                  color: activeTab === item.id ? C.ac : C.sec,
                  background: "transparent", border: "none",
                  borderBottom: activeTab === item.id ? `2px solid ${C.ac}` : "2px solid transparent",
                  textShadow: activeTab === item.id ? (theme === "dark" ? "0 0 16px rgba(175,169,236,.5)" : "none") : "none",
                  cursor: "pointer",
                }}
              >
                <i className={`ti ${item.icon}`} aria-hidden="true" style={{ fontSize: 16 }}></i>
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main style={S.main}>
        {hasWallet && (
          <h1 style={{ fontSize: 21, fontWeight: 800, color: C.tx, letterSpacing: "-0.4px", textTransform: "capitalize", margin: 0 }}>{activeTab}</h1>
        )}

        {!hasWallet && isLoggedIn && (
          <button onClick={handleBack} style={{ background: "transparent", color: "#888", border: "1px solid #e5e3ed", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>← Back</button>
        )}
        {!hasWallet && (
          <div className="hc-landing">
            <div className="hc-landing-glow" aria-hidden="true" />
            <div className="hc-landing-glow2" aria-hidden="true" />
            <div className="hc-landing-content">

              <div style={{ textAlign: "center", marginBottom: 34 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, color: "#c3b9ff", background: "rgba(147,124,255,.14)", border: "1px solid rgba(147,124,255,.3)", padding: "6px 14px", borderRadius: 20, letterSpacing: ".07em", marginBottom: 20 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#93e6b3", display: "inline-block", animation: "hcPulse 1.8s ease-in-out infinite" }} />
                  ARC TESTNET
                </span>
                <div className="hc-landing-title">HashCrew</div>
                <div style={{ fontSize: 16, color: "#a79fd1", fontWeight: 500 }}>
                  {signingIn ? "Opening Google..." : isLoggedIn ? "Creating your wallet..." : !deviceToken ? "Preparing secure session..." : "The wallet that fits how you already move"}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                <button
                  className="hc-landing-cta"
                  onClick={startGoogleSignIn}
                  disabled={!deviceToken || signingIn || isLoggedIn}
                  style={{
                    display: "flex", alignItems: "center", gap: 16, width: "100%", textAlign: "left" as const,
                    background: "linear-gradient(120deg, #8b7bf7 0%, #5b8cf5 100%)", border: "none", borderRadius: 18, padding: "20px 22px",
                    cursor: (!deviceToken || signingIn || isLoggedIn) ? "wait" : "pointer",
                    opacity: !deviceToken ? 0.55 : 1,
                    boxShadow: "0 10px 30px rgba(107,109,244,.35)",
                  }}
                >
                  <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 13, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`ti ${(signingIn || isLoggedIn) ? "ti-loader-2" : "ti-brand-google"}`} aria-hidden="true" style={{ fontSize: 22, color: "#fff" }}></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Continue with Google</div>
                    <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", marginTop: 3, fontWeight: 500 }}>{deviceToken ? "No seed phrase — your wallet is ready instantly" : "Preparing..."}</div>
                  </div>
                  <i className="ti ti-chevron-right" aria-hidden="true" style={{ fontSize: 18, color: "rgba(255,255,255,.85)" }}></i>
                </button>

                <div
                  className="hc-landing-cta"
                  style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: "20px 22px", backdropFilter: "blur(6px)" }}
                >
                  <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 13, background: "rgba(147,124,255,.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-wallet" aria-hidden="true" style={{ fontSize: 22, color: "#b3a4ff" }}></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#f4f2ff" }}>Connect a wallet</div>
                    <div style={{ fontSize: 12.5, color: "#a79fd1", marginTop: 3, fontWeight: 500 }}>MetaMask, Rabby, Coinbase</div>
                  </div>
                  <WalletConnect />
                </div>

              </div>

              {loginError && (
                <div style={{ marginTop: 16, fontSize: 12.5, color: "#ffb4b4", background: "rgba(255,80,80,.12)", border: "1px solid rgba(255,80,80,.25)", padding: "12px 16px", borderRadius: 12, fontWeight: 500 }}>
                  {loginError}
                </div>
              )}

              {(isLoggedIn || signingIn) && (
                <button onClick={handleBack} style={{ display: "block", margin: "18px auto 0", background: "transparent", border: "none", color: "#a79fd1", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  Start over
                </button>
              )}

              <div style={{ textAlign: "center", marginTop: 32, fontSize: 11.5, color: "#736c94", lineHeight: 1.8, fontWeight: 500 }}>
                Built on Arc, secured by Circle<br />HashCrew never asks for your recovery phrase
              </div>

            </div>
          </div>
        )}

        {hasWallet && activeTab === "dashboard" && (
          <div className="hc-dash-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={S.balCard}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#8f8ab8", letterSpacing: ".08em" }}>// TOTAL BALANCE</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, color: "#afa9ec", background: "#241f4d", padding: "5px 10px", borderRadius: 20, letterSpacing: ".06em" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#afa9ec", display: "inline-block", animation: "hcPulse 1.8s ease-in-out infinite" }} />
                    LIVE
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 64, fontWeight: 700, color: "#fff", letterSpacing: "-3px", lineHeight: .95 }}>
                    {(usdcBalance ? parseFloat(usdcBalance) : 0).toFixed(2).split(".")[0]}
                  </span>
                  <span style={{ fontSize: 34, fontWeight: 700, color: "#6b6690", letterSpacing: "-1.5px" }}>
                    .{(usdcBalance ? parseFloat(usdcBalance) : 0).toFixed(2).split(".")[1]}
                  </span>
                  <span style={{ fontSize: 17, color: "#afa9ec" }}>USDC</span>
                </div>
                <div style={{ display: "flex", gap: 9, marginTop: 26, flexWrap: "wrap" }}>
                  <button onClick={() => setActiveTab("history")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#241f4d", color: "#cecbf6", border: "none", fontSize: 13, fontWeight: 600, padding: "11px 20px", borderRadius: 11, cursor: "pointer" }}><i className="ti ti-list" aria-hidden="true"></i> History</button>
                  <button onClick={() => setActiveTab("bridge")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#241f4d", color: "#cecbf6", border: "none", fontSize: 13, fontWeight: 600, padding: "11px 20px", borderRadius: 11, cursor: "pointer" }}><i className="ti ti-arrows-exchange" aria-hidden="true"></i> Bridge</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                <div style={S.card}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: C.badgeGrad, color: C.ac, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><i className="ti ti-coin" aria-hidden="true" style={{ fontSize: 19 }}></i></div>
                  <div style={S.micro}>// EURC</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: C.tx, marginTop: 6, letterSpacing: "-.5px" }}>{parseFloat(eurcBalance).toFixed(2)}</div>
                </div>
                <div style={S.card}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: C.badgeGrad, color: C.ac, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><i className="ti ti-topology-star" aria-hidden="true" style={{ fontSize: 19 }}></i></div>
                  <div style={S.micro}>// NETWORK</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: C.ac, marginTop: 6, letterSpacing: "-.5px" }}>{primaryWallet.blockchain}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.mut, marginTop: 4 }}>T+0 settlement</div>
                </div>
                <div style={S.card}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: C.badgeGrad, color: C.ac, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><i className="ti ti-wallet" aria-hidden="true" style={{ fontSize: 19 }}></i></div>
                  <div style={S.micro}>// WALLET</div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: C.tx, marginTop: 9 }}>{primaryWallet.address.slice(0,6)}…{primaryWallet.address.slice(-4)}</div>
                  <button onClick={() => { navigator.clipboard.writeText(primaryWallet.address); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ marginTop: 10, background: "transparent", border: `0.5px solid ${C.bd}`, borderRadius: 8, padding: "5px 11px", fontSize: 11, fontWeight: 600, color: copied ? C.ac : C.sec, cursor: "pointer" }}>{copied ? "Copied" : "Copy"}</button>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={S.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, display: "flex", alignItems: "center", gap: 6 }}><i className="ti ti-arrow-up" aria-hidden="true" style={{ fontSize: 15, color: C.ac }}></i> Quick send</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input value={sendAddress} onChange={e => setSendAddress(e.target.value)} placeholder="Recipient 0x..." style={{ ...S.input, fontSize: 13, padding: "10px 12px" }} />
                  <input value={sendAmount} onChange={e => setSendAmount(e.target.value)} type="number" placeholder="Amount (USDC)" style={{ ...S.input, fontSize: 13, padding: "10px 12px" }} />
                  <button disabled={sending || !sendAddress || !sendAmount} onClick={handleSendUsdc} style={{ ...S.sendBtn, padding: 10, fontSize: 13, opacity: sending || !sendAddress || !sendAmount ? 0.5 : 1, cursor: sending || !sendAddress || !sendAmount ? "not-allowed" : "pointer" }}>
                    {sending ? (walletMode === "evm" ? "Confirm in MetaMask..." : "Confirming...") : "Send USDC"}
                  </button>
                  {sendMsg && <div style={{ fontSize: 12, padding: "9px 12px", borderRadius: 9, background: sendMsg.type === "ok" ? "#e8f5e9" : "#fce8e8", color: sendMsg.type === "ok" ? "#2e7d32" : "#c62828", fontWeight: 600 }}>{sendMsg.text}</div>}
                </div>
              </div>

              <div style={S.card}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}><i className="ti ti-arrow-down" aria-hidden="true" style={{ fontSize: 15, color: C.ac }}></i> Quick receive</div>
                <div style={{ background: C.sub, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "12px 14px", fontFamily: MONO, fontSize: 12, color: C.tx, wordBreak: "break-all" as const, marginBottom: 12 }}>{primaryWallet.address}</div>
                <button onClick={() => { navigator.clipboard.writeText(primaryWallet.address); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ ...S.sendBtn, padding: 10, fontSize: 13, background: copied ? "#2e7d32" : C.ac }}>
                  {copied ? "Copied!" : "Copy address"}
                </button>
              </div>
            </div>
          </div>
        )}

        {hasWallet && activeTab === "bridge" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 520 }}>
            {walletMode !== "evm" ? (
              <div style={{ ...S.card }}>
                <div style={S.cardTitle}>Bridge USDC (CCTP)</div>
                <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
                  Bridge signs a real on-chain transaction on the source chain, so it needs a self-custodial wallet
                  you hold the keys for. Connect with MetaMask instead of Google to use the bridge — your USDC
                  balance and everything else will still be there.
                </div>
              </div>
            ) : (
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>Bridge USDC (CCTP)</div>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 14, lineHeight: 1.5 }}>
                    Powered by Circle's Cross-Chain Transfer Protocol — burns USDC on the source chain and mints real USDC on the destination. No wrapped tokens.
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>From</div>
                      <select value={bridgeFrom} onChange={(e) => setBridgeFrom(e.target.value)} style={S.input}>
                        {BRIDGE_TESTNET_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                    <button
                      onClick={() => { const f = bridgeFrom; setBridgeFrom(bridgeTo); setBridgeTo(f); }}
                      aria-label="Swap direction"
                      style={{ marginTop: 20, background: "#f8f7fc", border: "1px solid #e5e3ed", borderRadius: 9, width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <i className="ti ti-arrows-right-left" aria-hidden="true"></i>
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>To</div>
                      <select value={bridgeTo} onChange={(e) => setBridgeTo(e.target.value)} style={S.input}>
                        {BRIDGE_TESTNET_CHAINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>Amount (USDC)</div>
                    <input value={bridgeAmount} onChange={(e) => setBridgeAmount(e.target.value)} type="number" placeholder="0.00" style={S.input} />
                  </div>

                  <button
                    disabled={bridgeKit.status === "running" || !bridgeAmount || bridgeFrom === bridgeTo}
                    onClick={() => { bridgeKit.reset(); bridgeKit.runBridge(bridgeFrom, bridgeTo, bridgeAmount).catch(() => {}); }}
                    style={{ ...S.sendBtn, opacity: bridgeKit.status === "running" || !bridgeAmount || bridgeFrom === bridgeTo ? 0.5 : 1, cursor: bridgeKit.status === "running" || !bridgeAmount || bridgeFrom === bridgeTo ? "not-allowed" : "pointer" }}
                  >
                    {bridgeKit.status === "running" ? "Bridging..." : "Bridge USDC"}
                  </button>

                  {bridgeFrom === bridgeTo && (
                    <div style={{ fontSize: 11, color: "#c62828", marginTop: 8 }}>Source and destination must be different.</div>
                  )}
                  {bridgeKit.errorMsg && (
                    <div style={{ fontSize: 13, padding: "10px 14px", borderRadius: 10, background: "#fce8e8", color: "#c62828", fontWeight: 600, marginTop: 10 }}>{bridgeKit.errorMsg}</div>
                  )}
                  {bridgeKit.status === "success" && (
                    <div style={{ fontSize: 13, padding: "10px 14px", borderRadius: 10, background: "#e8f5e9", color: "#2e7d32", fontWeight: 600, marginTop: 10 }}>Bridge complete! Funds should arrive on the destination chain shortly.</div>
                  )}
                </div>

                {bridgeKit.steps.length > 0 && (
                  <div style={S.card}>
                    <div style={S.cardTitle}>Progress</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {bridgeKit.steps.map((step, i) => (
                        <div key={step.name + i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 9, background: "#f8f7fc" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%",
                              background: step.state === "success" ? "#2e7d32" : step.state === "error" ? "#c62828" : "#f59e0b",
                            }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", textTransform: "capitalize" }}>{step.name}</span>
                          </div>
                          {step.explorerUrl ? (
                            <a href={step.explorerUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#1b1464", fontWeight: 700 }}>View tx</a>
                          ) : (
                            <span style={{ fontSize: 11, color: "#aaa", textTransform: "capitalize" }}>{step.state}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {hasWallet && activeTab === "treasury" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#1b1464", borderRadius: 16, padding: 24, color: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: .6, textTransform: "uppercase" as const, letterSpacing: ".08em", marginBottom: 8 }}>Treasury Balance</div>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-1px", marginBottom: 4 }}>{parseFloat(usdcBalance || "0").toFixed(2)} USDC</div>
              <div style={{ fontSize: 13, opacity: .6 }}>+ {eurcBalance} EURC</div>
              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 16px", fontSize: 12, fontWeight: 600 }}>
                  {rules.filter(r => r.active).length} active rules
                </div>
                <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 16px", fontSize: 12, fontWeight: 600 }}>
                  Auto-management ON
                </div>
              </div>
            </div>

            <div style={S.card}>
              <div style={S.cardTitle}>Create automation rule</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#888", display: "block", marginBottom: 6 }}>Condition</label>
                    <select value={ruleType} onChange={e => setRuleType(e.target.value)} style={S.input}>
                      <option value="above">Balance above</option>
                      <option value="below">Balance below</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#888", display: "block", marginBottom: 6 }}>Threshold (USDC)</label>
                    <input value={ruleThreshold} onChange={e => setRuleThreshold(e.target.value)} type="number" placeholder="50" style={S.input} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#888", display: "block", marginBottom: 6 }}>Action</label>
                  <select value={ruleAction} onChange={e => setRuleAction(e.target.value)} style={S.input}>
                    <option value="stake">Auto-stake in garden</option>
                    <option value="notify">Notify me</option>
                    <option value="swap">Auto-swap to EURC</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#888", display: "block", marginBottom: 6 }}>Amount (USDC)</label>
                  <input value={ruleAmount} onChange={e => setRuleAmount(e.target.value)} type="number" placeholder="10" style={S.input} />
                </div>
                <button onClick={() => {
                  if (!ruleThreshold || !ruleAmount) { setRuleMsg({ type: "err", text: "Fill all fields" }); return; }
                  const newRule = { id: Date.now(), type: ruleType, threshold: ruleThreshold, action: ruleAction, amount: ruleAmount, address: ruleAddress, active: true };
                  const updated = [...rules, newRule];
                  setRules(updated);
                  localStorage.setItem("treasury_rules", JSON.stringify(updated));
                  setRuleThreshold(""); setRuleAmount(""); setRuleAddress("");
                  setRuleMsg({ type: "ok", text: "Rule created! Monitoring balance..." });
                  setTimeout(() => setRuleMsg(null), 3000);
                }} style={S.sendBtn}>Create rule</button>
                {ruleMsg && <div style={{ fontSize: 13, padding: "10px 14px", borderRadius: 10, background: ruleMsg.type === "ok" ? "#e8f5e9" : "#fce8e8", color: ruleMsg.type === "ok" ? "#2e7d32" : "#c62828", fontWeight: 600 }}>{ruleMsg.text}</div>}
              </div>
            </div>

            {rules.length > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>Active rules</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {rules.map((rule, i) => {
                    const balance = parseFloat(usdcBalance || "0");
                    const threshold = parseFloat(rule.threshold);
                    const triggered = rule.type === "above" ? balance > threshold : balance < threshold;
                    return (
                      <div key={rule.id} style={{ background: triggered ? "#e8f5e9" : "#f8f7fc", borderRadius: 10, border: `1px solid ${triggered ? "#c8e6c9" : "#e5e3ed"}`, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
                            If balance {rule.type === "above" ? ">" : "<"} {rule.threshold} USDC → {rule.action === "stake" ? "stake" : rule.action === "swap" ? "swap to EURC" : "notify"} {rule.amount} USDC
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: triggered ? "#2e7d32" : "#bbb" }}>
                            {triggered ? "✓ Condition met!" : "Monitoring..."}
                          </div>
                        </div>
                        <button onClick={() => {
                          const updated = rules.filter((_, j) => j !== i);
                          setRules(updated);
                          localStorage.setItem("treasury_rules", JSON.stringify(updated));
                        }} style={{ background: "transparent", border: "1px solid #e5e3ed", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#888", cursor: "pointer" }}>Delete</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {hasWallet && activeTab === "treasury" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Staked", value: seeds.reduce((a, s) => a + parseFloat(s.amount || "0"), 0).toFixed(2) + " USDC" },
                { label: "Plants", value: seeds.length + " / 6" },
                { label: "Longest", value: seeds.length > 0 ? (() => { const ms = Math.max(...seeds.map(s => Date.now() - s.plantedAt)); const d = Math.floor(ms/86400000); const h = Math.floor(ms/3600000); return d > 0 ? d + " days" : h + "h"; })() : "0 days" },
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
                  const msAgo = Date.now() - seed.plantedAt; const days = Math.floor(msAgo / 86400000); const hours = Math.floor(msAgo / 3600000);
                  const plant = days >= 14 ? "🌳" : days >= 7 ? "🌸" : days >= 3 ? "🌿" : "🌱";
                  const stage = days >= 14 ? "Tree" : days >= 7 ? "Flower" : days >= 3 ? "Plant" : "Sprout";
                  return (
                    <div key={i} style={{ background: "#f8f7fc", borderRadius: 10, border: "1px solid #e5e3ed", padding: 14, textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 6 }}>{plant}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1b1464" }}>{parseFloat(seed.amount).toFixed(2)} USDC</div>
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{stage} · {days > 0 ? days + "d" : hours + "h"}</div>
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

        {hasWallet && activeTab === "dashboard" && (() => {
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

        {hasWallet && activeTab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 600 }}>
            <div style={{ background: "#0f0e1a", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", height: 500 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #ffffff10" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #1b1464)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>HashCrew AI</div>
                  <div style={{ fontSize: 12, color: "#ffffff40", fontWeight: 500 }}>Your Web3 assistant</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7" }}></div>
                  <span style={{ fontSize: 11, color: "#a855f7", fontWeight: 600 }}>Online</span>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                {aiMessages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: msg.role === "user" ? "#7c3aed" : "#ffffff10", color: "#fff", fontSize: 13, fontWeight: 500, lineHeight: 1.5, whiteSpace: "pre-line" as const }}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", background: "#ffffff10", color: "#ffffff50", fontSize: 13 }}>Thinking...</div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={async e => {
                  if (e.key === "Enter" && aiInput.trim() && !aiLoading) {
                    const msg = aiInput.trim();
                    setAiInput("");
                    setAiMessages(prev => [...prev, { role: "user", text: msg }]);
                    setAiLoading(true);
                    try {
                      const res = await fetch("/api/endpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "askAI", message: msg, balance: usdcBalance, blockchain: primaryWallet?.blockchain }) });
                      const data = await res.json();
                      const reply = data.reply || "Sorry, I could not process that.";
                      setAiMessages(prev => [...prev, { role: "ai", text: reply }]);
                      const jsonMatch = reply.match(/```json\n?([\s\S]*?)\n?```/);
                      if (jsonMatch) {
                        try {
                          const parsed = JSON.parse(jsonMatch[1]);
                          const addr = parsed.recipient || parsed.toAddress || parsed.to || parsed.address;
                          if (parsed.action === "transfer" && addr && parsed.amount) {
                            setSendAddress(addr);
                            setSendAmount(String(parsed.amount));
                            setActiveTab("dashboard");
                            setAiMessages(prev => [...prev, { role: "ai", text: "Send form pre-filled! Check the Quick Send panel on your Dashboard to confirm." }]);
                          }
                        } catch {}
                      }
                    } catch { setAiMessages(prev => [...prev, { role: "ai", text: "Connection error. Please try again." }]); }
                    setAiLoading(false);
                  }
                }} placeholder="Ask me anything... (press Enter)" style={{ flex: 1, background: "#ffffff08", border: "1px solid #ffffff15", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#fff", outline: "none" }} />
                <button onClick={async () => {
                  if (!aiInput.trim() || aiLoading) return;
                  const msg = aiInput.trim();
                  setAiInput("");
                  setAiMessages(prev => [...prev, { role: "user", text: msg }]);
                  setAiLoading(true);
                  try {
                    const res = await fetch("/api/endpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "askAI", message: msg, balance: usdcBalance, blockchain: primaryWallet?.blockchain }) });
                    const data = await res.json();
                    setAiMessages(prev => [...prev, { role: "ai", text: data.reply || "Sorry, I couldn't process that." }]);
                  } catch { setAiMessages(prev => [...prev, { role: "ai", text: "Connection error. Please try again." }]); }
                  setAiLoading(false);
                }} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Send</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {["What is my balance?", "How do I send USDC?", "Tell me about Arc", "How does staking work?"].map((q, i) => (
                <button key={i} onClick={async () => {
                  setAiMessages(prev => [...prev, { role: "user", text: q }]);
                  setAiLoading(true);
                  try {
                    const res = await fetch("/api/endpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "askAI", message: q, balance: usdcBalance, blockchain: primaryWallet?.blockchain }) });
                    const data = await res.json();
                    setAiMessages(prev => [...prev, { role: "ai", text: data.reply || "Sorry, I couldn't process that." }]);
                  } catch { setAiMessages(prev => [...prev, { role: "ai", text: "Connection error." }]); }
                  setAiLoading(false);
                }} style={{ background: "#fff", border: "1px solid #e5e3ed", borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#1b1464", cursor: "pointer", textAlign: "left" as const }}>{q}</button>
              ))}
            </div>
          </div>
        )}

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

              <div style={S.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={S.cardTitle}>On-chain badges</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.ac, background: C.badgeGrad, padding: "4px 10px", borderRadius: 20, letterSpacing: ".04em" }}>REAL NFTs · ARC TESTNET</span>
                </div>
                {walletMode !== "evm" ? (
                  <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>
                    Badges mint as real NFTs signed by your own wallet, so this needs a self-custodial connection.
                    Connect with MetaMask instead of Google to mint badges — everything else stays the same.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    {BADGES.map((b) => {
                      const eligible = b.id === 0 ? hasSent : b.id === 1 ? hasReceived : b.id === 2 ? bridgeKit.status === "success" : isWhale;
                      const isMinted = !!badges.minted[b.id];
                      const isMinting = badges.mintingId === b.id;
                      return (
                        <div key={b.id} style={{ background: isMinted ? "#e8e6f8" : "#f8f7fc", borderRadius: 12, border: `1px solid ${isMinted ? "#c8c5e8" : "#e5e3ed"}`, padding: 16, opacity: eligible || isMinted ? 1 : 0.5 }}>
                          <div style={{ fontSize: 28, marginBottom: 8 }}>{eligible || isMinted ? b.icon : "🔒"}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: isMinted ? "#1b1464" : "#888", marginBottom: 4 }}>{b.title}</div>
                          <div style={{ fontSize: 11, color: isMinted ? "#534AB7" : "#bbb", fontWeight: 500, marginBottom: 10 }}>{b.desc}</div>
                          {isMinted ? (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#1b1464", background: "#fff", padding: "3px 8px", borderRadius: 20, display: "inline-block" }}>Minted ✓</div>
                          ) : eligible ? (
                            <button disabled={isMinting} onClick={() => badges.mint(b.id)} style={{ ...S.sendBtn, padding: "7px 12px", fontSize: 12, opacity: isMinting ? 0.6 : 1, cursor: isMinting ? "wait" : "pointer" }}>
                              {isMinting ? "Confirm in MetaMask..." : "Mint badge"}
                            </button>
                          ) : (
                            <div style={{ fontSize: 11, color: "#bbb", fontWeight: 600 }}>Not eligible yet</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {badges.error && (
                  <div style={{ fontSize: 12, padding: "10px 14px", borderRadius: 10, background: "#fce8e8", color: "#c62828", fontWeight: 600, marginTop: 12 }}>{badges.error}</div>
                )}
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

        {hasWallet && activeTab === "about" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#1b1464", borderRadius: 16, padding: 28, color: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#1b1464" }}>H</div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>HashCrew</div>
                  <div style={{ fontSize: 13, opacity: .6, fontWeight: 500 }}>Arc Testnet Wallet</div>
                </div>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, opacity: .8, fontWeight: 500 }}>A Web3 wallet on Arc Testnet with two ways in: sign in with Google for a Circle-managed wallet with no seed phrase, or connect MetaMask for full self-custody — same balance, send, and history either way. Bridge USDC across chains via Circle's CCTP, and mint real on-chain NFT badges for milestones on your own wallet.</div>
              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <a href="https://hashcrewtest.vercel.app" target="_blank" rel="noreferrer" style={{ background: "#fff", color: "#1b1464", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>🌐 Live Demo</a>
                <a href="https://github.com/rubcovanatali9999-svg/circle-test" target="_blank" rel="noreferrer" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>GitHub →</a>
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Features</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { icon: "🔐", title: "Google OAuth Login", desc: "No-seed-phrase wallet via Circle SDK" },
                  { icon: "🦊", title: "MetaMask Login", desc: "Self-custodial mode, real on-chain balance" },
                  { icon: "💸", title: "Send USDC", desc: "Real on-chain transactions on Arc" },
                  { icon: "🌉", title: "CCTP Bridge", desc: "Move USDC across chains via Circle Bridge Kit" },
                  { icon: "🏆", title: "On-chain Badges", desc: "Real NFTs minted from your own wallet" },
                  { icon: "🌱", title: "Treasury & Garden", desc: "Automation rules + gamified staking" },
                  { icon: "📊", title: "Analytics", desc: "Balance history with charts" },
                  { icon: "🤖", title: "AI Assistant", desc: "Natural-language send, powered by Claude" },
                  { icon: "📚", title: "Learn", desc: "Arc House community content" },
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px", background: "#f8f7fc", borderRadius: 10, border: "1px solid #e5e3ed" }}>
                    <div style={{ fontSize: 20 }}>{f.icon}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>{f.title}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2, fontWeight: 500 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Tech Stack</div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                {["Next.js 16", "TypeScript", "React", "Circle SDK", "Circle Bridge Kit", "wagmi + viem", "Solidity / ERC-721", "Arc Testnet", "USDC", "Google OAuth", "Vercel"].map((t, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 700, background: "#e8e6f8", color: "#1b1464", padding: "5px 12px", borderRadius: 20 }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Why Arc?</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.7, fontWeight: 500 }}>Arc is Circle's Layer-1 built for stablecoin-native finance — USDC as native gas, sub-second finality, and CCTP for moving USDC natively across chains without wrapped tokens. HashCrew is built to work equally well for Web2-native users (Google login, no seed phrase) and Web3-native users (bring your own wallet), on the same rails.</div>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>On-chain contracts</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.7, fontWeight: 500, marginBottom: 10 }}>HashCrew Badges — a fully on-chain ERC-721 (artwork and metadata generated in the contract itself, no external hosting).</div>
              <a href="https://testnet.arcscan.app/address/0xb3d15388Ce100Ae18937CFFfdADcec7D6b523800" target="_blank" rel="noreferrer" style={{ fontSize: 12, fontFamily: "monospace", color: "#1b1464", fontWeight: 700, textDecoration: "none", background: "#f8f7fc", border: "1px solid #e5e3ed", borderRadius: 8, padding: "8px 12px", display: "inline-block" }}>0xb3d1...3800 ↗ View on ArcScan</a>
            </div>
            <div style={{ ...S.card, textAlign: "center" as const }}>
              <div style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>Built with ❤️ for the Arc ecosystem</div>
              <div style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>by Natali Rubtsova</div>
            </div>
          </div>
        )}

        {hasWallet && activeTab === "history" && (
          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={S.cardTitle}>Transaction history</div>
              <button onClick={() => {
                if (walletMode === "evm" && evm.address) {
                  setTxLoading(true);
                  evm.loadEvmHistory(evm.address).then((txs) => setTransactions(txs)).catch(() => setTransactions([])).finally(() => setTxLoading(false));
                } else if (primaryWallet && loginResult) {
                  loadTransactions(loginResult.userToken, primaryWallet.id);
                }
              }} style={{ background: "transparent", border: "1px solid #e5e3ed", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#888", cursor: "pointer" }}>Refresh</button>
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
                        {tx.networkFee && <div style={{ fontSize: 11, color: "#bbb" }}>fee: {parseFloat(tx.networkFee).toFixed(6)} USDC</div>}
                        <div style={{ fontSize: 11, color: "#bbb" }}>{date}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 28, fontSize: 11, color: C.mut }}>
          {status}
        </div>
      </main>
    </div>
  );
}
