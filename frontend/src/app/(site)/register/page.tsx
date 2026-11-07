"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { registerWarranty } from "@/lib/api";
import styles from "./register.module.css";

const WINDOWS = [
  { key: "left-front", label: "Front left" },
  { key: "right-front", label: "Front right" },
  { key: "left-rear", label: "Rear left" },
  { key: "right-rear", label: "Rear right" },
  { key: "rear", label: "Rear windscreen" },
];

const PANELS = [
  { key: "hood", label: "Hood" },
  { key: "front-bumper", label: "Front bumper" },
  { key: "roof", label: "Roof" },
  { key: "trunk", label: "Trunk / boot" },
  { key: "rear-bumper", label: "Rear bumper" },
  { key: "left-front-fender", label: "Left front fender" },
  { key: "right-front-fender", label: "Right front fender" },
  { key: "left-doors", label: "Left doors" },
  { key: "right-doors", label: "Right doors" },
  { key: "left-rear-quarter", label: "Left rear quarter" },
  { key: "right-rear-quarter", label: "Right rear quarter" },
  { key: "mirrors", label: "Mirrors" },
];

type FormState = {
  type: "tint" | "ppf";
  make: string; model: string; owner: string; phone: string;
  plate: string; vin: string; filmSerial: string; invoiceNumber: string;
  installed: string; sellerName: string; sellerPhone: string; installer: string;
  windows: string[]; panels: string[];
};

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>({
    type: "tint",
    make: "", model: "", owner: "", phone: "",
    plate: "", vin: "", filmSerial: "", invoiceNumber: "",
    installed: "", sellerName: "", sellerPhone: "", installer: "",
    windows: [], panels: [],
  });
  const [step, setStep] = useState<0 | 1>(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ code: string; flags: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof FormState, value: string) {
    setForm(p => ({ ...p, [key]: value }));
  }

  function toggleArea(key: string) {
    const field = form.type === "tint" ? "windows" : "panels";
    setForm(p => {
      const cur = p[field] as string[];
      return { ...p, [field]: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await registerWarranty({
        type: form.type,
        make: form.make, model: form.model, owner: form.owner, phone: form.phone,
        plate: form.plate, vin: form.vin, filmSerial: form.filmSerial,
        invoiceNumber: form.invoiceNumber, installed: form.installed,
        sellerName: form.sellerName, sellerPhone: form.sellerPhone, installer: form.installer,
        windows: form.type === "tint" ? form.windows : undefined,
        panels: form.type === "ppf" ? form.panels : undefined,
      });
      setResult(r);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className={styles.page}>
        <div className={styles.success}>
          <div className={styles.successIcon}>✓</div>
          <h2>Registration submitted</h2>
          <p>Warranty code:</p>
          <code>{result.code}</code>
          {result.flags.length > 0 && (
            <p className={styles.flagNote}>
              Flags for review: {result.flags.join(", ")}
            </p>
          )}
          <p>Your customer can check the status at:</p>
          <Link href={`/warranty?code=${result.code}`} className={styles.link}>
            /warranty?code={result.code}
          </Link>
          <button className={styles.btnReset} onClick={() => { setResult(null); setForm(p => ({...p, vin:"",filmSerial:"",invoiceNumber:"",installed:"",windows:[],panels:[]})); }}>
            Register another
          </button>
        </div>
      </div>
    );
  }

  const areas = form.type === "tint" ? WINDOWS : PANELS;
  const selected = form.type === "tint" ? form.windows : form.panels;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/solarzed-original.png" width={170} height={34} alt="SOLARZED" />
        </Link>
        <span className={styles.title}>Installer Registration</span>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.steps}>
            <button type="button" onClick={() => setStep(0)} className={step === 0 ? styles.stepActive : styles.stepInactive}>
              <span>01</span> Product &amp; vehicle
            </button>
            <button type="button" onClick={() => setStep(1)} className={step === 1 ? styles.stepActive : styles.stepInactive}>
              <span>02</span> Coverage &amp; submit
            </button>
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            {step === 0 && (
              <fieldset>
                <legend>Product type</legend>
                <div className={styles.radioGroup}>
                  {[{ v: "tint" as const, label: "Window film" }, { v: "ppf" as const, label: "Paint protection film (PPF)" }].map(o => (
                    <label key={o.v} className={form.type === o.v ? styles.radioActive : styles.radio}>
                      <input type="radio" name="type" value={o.v} checked={form.type === o.v} onChange={() => set("type", o.v)} />
                      {o.label}
                    </label>
                  ))}
                </div>

                <div className={styles.grid}>
                  {[
                    { k: "make", l: "Vehicle make", p: "Toyota, BMW…" },
                    { k: "model", l: "Vehicle model", p: "Camry, X5…" },
                    { k: "vin", l: "VIN (17 characters)", p: "1HGBH41JXMN109186" },
                    { k: "plate", l: "Licence plate", p: "A123-BC" },
                    { k: "owner", l: "Customer name", p: "" },
                    { k: "phone", l: "Customer mobile", p: "+9891……" },
                    { k: "filmSerial", l: "Film serial / roll ID", p: "SZ-PIR-26-000001" },
                    { k: "invoiceNumber", l: "Invoice number", p: "" },
                    { k: "installed", l: "Installation date", p: "YYYY-MM-DD" },
                    { k: "installer", l: "Installer name / company", p: "" },
                    { k: "sellerName", l: "Seller / shop name", p: "" },
                    { k: "sellerPhone", l: "Seller phone", p: "" },
                  ].map(f => (
                    <label key={f.k} className={f.k === "vin" ? styles.fullWidth : ""}>
                      {f.l}
                      <input
                        required
                        value={form[f.k as keyof FormState]}
                        placeholder={f.p}
                        type={f.k === "installed" ? "date" : "text"}
                        onChange={e => set(f.k as keyof FormState, e.target.value)}
                      />
                    </label>
                  ))}
                </div>

                <button type="button" className={styles.btnNext} onClick={() => setStep(1)}>
                  Next: coverage →
                </button>
              </fieldset>
            )}

            {step === 1 && (
              <fieldset>
                <legend>Coverage areas — {form.type === "tint" ? "Windows" : "Panels"}</legend>
                <div className={styles.areaGrid}>
                  {areas.map(a => (
                    <label key={a.key} className={selected.includes(a.key) ? styles.areaActive : styles.area}>
                      <input type="checkbox" checked={selected.includes(a.key)} onChange={() => toggleArea(a.key)} />
                      {a.label}
                    </label>
                  ))}
                </div>

                <div className={styles.areaPresets}>
                  {form.type === "ppf" && (
                    <>
                      <button type="button" onClick={() => setForm(p => ({ ...p, panels: ["hood","front-bumper","left-front-fender","right-front-fender","mirrors"] }))}>
                        Full front
                      </button>
                      <button type="button" onClick={() => setForm(p => ({ ...p, panels: PANELS.map(p => p.key) }))}>
                        Full body
                      </button>
                    </>
                  )}
                  {form.type === "tint" && (
                    <button type="button" onClick={() => setForm(p => ({ ...p, windows: WINDOWS.map(w => w.key) }))}>
                      All windows
                    </button>
                  )}
                  <button type="button" onClick={() => setForm(p => ({ ...p, windows: [], panels: [] }))}>
                    Clear
                  </button>
                </div>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.formActions}>
                  <button type="button" className={styles.btnBack} onClick={() => setStep(0)}>← Back</button>
                  <button type="submit" className={styles.btnSubmit} disabled={loading}>
                    {loading ? "Submitting…" : "Submit registration ↗"}
                  </button>
                </div>
              </fieldset>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
