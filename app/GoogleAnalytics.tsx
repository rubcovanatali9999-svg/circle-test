"use client";
import Script from "next/script";
export default function GoogleAnalytics() {
  return (
    <>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-WH02N5Y4C0" strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-WH02N5Y4C0');
      `}</Script>
    </>
  );
}
