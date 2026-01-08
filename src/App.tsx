import React, { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position
} from "reactflow";

/**
 * NOVA — Career Skill Tree (single-file core)
 * - Central node outward (radial layout)
 * - Locked paths shaded until qualified
 * - Search + category filters + focus navigation
 * - Custom node/edge builder (stored in localStorage)
 * - Simple resume builder (export as .txt / copy)
 */

type NodeKind =
  | "ROOT"
  | "HUB"
  | "CATEGORY"
  | "CREDENTIAL"
  | "SKILL"
  | "CAREER"
  | "SCHOOL"
  | "RESOURCE";

type EducationLevel = "NoHS" | "HS" | "SomeCollege" | "Associate" | "Bachelor" | "Master" | "Doctorate";

type Requirement =
  | { kind: "HAS"; credentialId: string }
  | { kind: "MIN"; field: "gpa" | "creditScore"; min: number }
  | { kind: "EDU"; levelAtLeast: EducationLevel }
  | { kind: "FLAG"; field: "wantsRemote" | "canRelocate"; mustBe: boolean };

type Profile = {
  name: string;
  email: string;
  phone: string;
  location: string;

  education: EducationLevel;
  gpa: number;
  creditScore: number;

  wantsRemote: boolean;
  canRelocate: boolean;

  credentials: Set<string>;
  skills: Set<string>;
};

type DataNode = {
  id: string;
  title: string;
  kind: NodeKind;
  subtitle?: string;
  tags?: string[];
  links?: { label: string; url: string }[];
  requirements?: Requirement[];

  ring?: number;
  sector?: number;
  order?: number;
};

type EvalStatus = "ELIGIBLE" | "LOCKED" | "RISK" | "INFO";

const EDU_ORDER: EducationLevel[] = ["NoHS","HS","SomeCollege","Associate","Bachelor","Master","Doctorate"];
const LS_KEY = "novaCareerTree.profile.v2";
const LS_CUSTOM = "novaCareerTree.customGraph.v2";

function eduGE(a: EducationLevel, b: EducationLevel) {
  return EDU_ORDER.indexOf(a) >= EDU_ORDER.indexOf(b);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeId(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function evalRequirements(reqs: Requirement[] | undefined, p: Profile): { status: EvalStatus; reasons: string[] } {
  if (!reqs || reqs.length === 0) return { status: "INFO", reasons: [] };

  const reasons: string[] = [];
  let risk = false;

  for (const r of reqs) {
    if (r.kind === "HAS") {
      if (!p.credentials.has(r.credentialId)) return { status: "LOCKED", reasons: [`Missing credential: ${r.credentialId}`] };
      reasons.push(`Has credential: ${r.credentialId}`);
    }
    if (r.kind === "MIN") {
      const v = p[r.field];
      if (v < r.min) return { status: "LOCKED", reasons: [`${r.field} ${v} < ${r.min}`] };
      reasons.push(`${r.field} ${v} ≥ ${r.min}`);
    }
    if (r.kind === "EDU") {
      if (!eduGE(p.education, r.levelAtLeast)) return { status: "LOCKED", reasons: [`Education: need ${r.levelAtLeast} (you: ${p.education})`] };
      reasons.push(`Education: ${p.education} ≥ ${r.levelAtLeast}`);
    }
    if (r.kind === "FLAG") {
      const v = p[r.field];
      if (v !== r.mustBe) {
        risk = true;
        reasons.push(`Preference mismatch: ${r.field} = ${v ? "true" : "false"} (wanted ${r.mustBe ? "true" : "false"})`);
      } else {
        reasons.push(`Preference match: ${r.field}`);
      }
    }
  }

  return { status: risk ? "RISK" : "ELIGIBLE", reasons };
}

function statusLabel(s: EvalStatus) {
  if (s === "ELIGIBLE") return "Available";
  if (s === "LOCKED") return "Locked";
  if (s === "RISK") return "Maybe";
  return "Info";
}

function statusStyle(s: EvalStatus) {
  if (s === "ELIGIBLE") return { border: "var(--ok)" };
  if (s === "RISK") return { border: "var(--warn)" };
  if (s === "LOCKED") return { border: "var(--lock)" };
  return { border: "rgba(213,173,54,.55)" };
}

function TreeNode(props: NodeProps<any>) {
  const { data } = props;
  const { border } = statusStyle(data.evalStatus as EvalStatus);
  const locked = data.evalStatus === "LOCKED";

  const kindBadge =
    data.kind === "CAREER" ? "Career" :
    data.kind === "CREDENTIAL" ? "Credential" :
    data.kind === "SKILL" ? "Skill" :
    data.kind === "CATEGORY" ? "Category" :
    data.kind === "ROOT" ? "Start" :
    data.kind === "RESOURCE" ? "Resource" :
    "Node";

  return (
    <div
      style={{
        width: 270,
        padding: 12,
        borderRadius: 14,
        border: `1px solid ${border}`,
        background: "rgba(0,0,0,.14)",
        color: "#fff",
        boxShadow: "0 10px 35px rgba(0,0,0,.28)",
        opacity: locked ? 0.55 : 1
      }}
      title={(data.evalReasons || []).join("\n")}
    >
      <Handle type="target" position={Position.Left} style={{ background: "rgba(213,173,54,.9)", border: "none" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {data.title}
          </div>
          <div style={{ fontSize: 12, opacity: 0.76, marginTop: 4, lineHeight: 1.25 }}>
            {data.subtitle ?? kindBadge}
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            padding: "6px 10px",
            borderRadius: 999,
            border: `1px solid ${border}`,
            background: "rgba(0,0,0,.12)",
            whiteSpace: "nowrap"
          }}
        >
          {statusLabel(data.evalStatus)}
        </div>
      </div>

      {(data.links?.length ?? 0) > 0 ? (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.links.slice(0, 3).map((l: any, i: number) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(213,173,54,.35)",
                background: "rgba(213,173,54,.10)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {l.label}
            </a>
          ))}
        </div>
      ) : null}

      {data.evalReasons?.length ? (
        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.72, lineHeight: 1.35 }}>
          {data.evalReasons.slice(0, 3).map((r: string, i: number) => (
            <div key={i}>• {r}</div>
          ))}
          {data.evalReasons.length > 3 ? <div>• …</div> : null}
        </div>
      ) : null}

      <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>{kindBadge}</div>
      <Handle type="source" position={Position.Right} style={{ background: "rgba(213,173,54,.9)", border: "none" }} />
    </div>
  );
}

const BASE_CREDENTIALS: { id: string; name: string; tags: string[] }[] = [
  { id: "comptia-a", name: "CompTIA A+", tags: ["tech"] },
  { id: "securityplus", name: "CompTIA Security+", tags: ["tech","security"] },
  { id: "aws-ccp", name: "AWS Cloud Practitioner", tags: ["tech","cloud"] },
  { id: "aws-saa", name: "AWS Solutions Architect", tags: ["tech","cloud"] },
  { id: "ccna", name: "Cisco CCNA", tags: ["tech","networking"] },
  { id: "emt", name: "EMT", tags: ["healthcare","public-safety"] },
  { id: "cna", name: "CNA", tags: ["healthcare"] },
  { id: "rn-license", name: "RN License", tags: ["healthcare"] },
  { id: "epa-608", name: "EPA 608", tags: ["trades"] },
  { id: "oshar-10", name: "OSHA 10", tags: ["trades","construction"] },
  { id: "pmp", name: "PMP", tags: ["business","pm"] },
  { id: "cpa", name: "CPA", tags: ["finance"] },
  { id: "part107", name: "FAA Part 107 (Drone)", tags: ["aviation","media"] },
  { id: "faa-med-1", name: "FAA Medical (Class 1)", tags: ["aviation"] }
];

const BASE_SKILLS: { id: string; name: string; tags: string[] }[] = [
  { id: "python", name: "Python", tags: ["tech"] },
  { id: "sql", name: "SQL", tags: ["tech","data"] },
  { id: "react", name: "React", tags: ["tech"] },
  { id: "linux", name: "Linux", tags: ["tech"] },
  { id: "networking", name: "Networking Fundamentals", tags: ["tech"] },
  { id: "customer-service", name: "Customer Service", tags: ["business","trades","healthcare"] },
  { id: "leadership", name: "Leadership", tags: ["business","public-safety"] },
  { id: "writing", name: "Writing", tags: ["creative","business"] },
  { id: "public-speaking", name: "Public Speaking", tags: ["business","public-safety"] }
];

const RESOURCE_LINKS: { label: string; url: string; tags: string[] }[] = [
  { label: "BLS Occupational Outlook Handbook", url: "https://www.bls.gov/ooh/", tags: ["career-research"] },
  { label: "O*NET Web Services (API)", url: "https://services.onetcenter.org/", tags: ["data","api"] },
  { label: "My Next Move (O*NET)", url: "https://www.mynextmove.org/", tags: ["career-research"] },
  { label: "O*NET Interest Profiler", url: "https://www.mynextmove.org/explore/ip", tags: ["assessment"] },
  { label: "CareerOneStop Web APIs", url: "https://www.careeronestop.org/Developers/WebAPI/web-api.aspx", tags: ["data","api"] },
  { label: "College Scorecard API", url: "https://collegescorecard.ed.gov/data/api-documentation/", tags: ["school","api"] },
  { label: "Credential Engine (CTDL / Registry)", url: "https://credentialengine.org/credential-transparency/credential-registry/", tags: ["credentials","data"] },
  { label: "USAJOBS Developer Portal", url: "https://developer.usajobs.gov/", tags: ["jobs","api"] },
  { label: "Apprenticeship Job Finder", url: "https://www.apprenticeship.gov/apprenticeship-job-finder", tags: ["trades","jobs"] },
  { label: "BLS Public Data API", url: "https://www.bls.gov/bls/api_features.htm", tags: ["data","api"] }
];

const CATEGORIES = [
  { id: "cat-tech", title: "Technology", tags: ["tech"] },
  { id: "cat-data", title: "Data / Analytics", tags: ["tech","data"] },
  { id: "cat-security", title: "Cybersecurity", tags: ["tech","security"] },
  { id: "cat-health", title: "Healthcare", tags: ["healthcare"] },
  { id: "cat-trades", title: "Skilled Trades", tags: ["trades"] },
  { id: "cat-business", title: "Business / PM", tags: ["business"] },
  { id: "cat-finance", title: "Finance", tags: ["finance"] },
  { id: "cat-aviation", title: "Aviation / Transportation", tags: ["aviation"] },
  { id: "cat-public", title: "Public Safety / Gov", tags: ["public-safety"] },
  { id: "cat-creative", title: "Creative / Media", tags: ["creative","media"] }
] as const;

const CAREERS: { id: string; title: string; catId: typeof CATEGORIES[number]["id"]; subtitle: string; reqs: Requirement[]; tags: string[] }[] = [
  { id: "career-helpdesk", title: "IT Support / Help Desk", catId: "cat-tech", subtitle: "Entry IT (tickets, troubleshooting)", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["tech","entry"] },
  { id: "career-sysadmin", title: "Systems Administrator", catId: "cat-tech", subtitle: "Servers, identity, automation", reqs: [{ kind: "EDU", levelAtLeast: "Associate" }, { kind: "HAS", credentialId: "comptia-a" }, { kind: "HAS", credentialId: "ccna" }], tags: ["tech"] },
  { id: "career-frontend", title: "Front-End Developer", catId: "cat-tech", subtitle: "UI engineering (web)", reqs: [{ kind: "EDU", levelAtLeast: "SomeCollege" }], tags: ["tech","software"] },
  { id: "career-cloud", title: "Cloud Engineer", catId: "cat-tech", subtitle: "Cloud infra + automation", reqs: [{ kind: "EDU", levelAtLeast: "Associate" }, { kind: "HAS", credentialId: "aws-ccp" }], tags: ["tech","cloud"] },

  { id: "career-data-analyst", title: "Data Analyst", catId: "cat-data", subtitle: "SQL, dashboards, insight", reqs: [{ kind: "EDU", levelAtLeast: "Associate" }], tags: ["data","tech"] },
  { id: "career-data-scientist", title: "Data Scientist", catId: "cat-data", subtitle: "Modeling + experimentation", reqs: [{ kind: "EDU", levelAtLeast: "Bachelor" }, { kind: "MIN", field: "gpa", min: 3.0 }], tags: ["data","tech"] },

  { id: "career-soc", title: "SOC Analyst", catId: "cat-security", subtitle: "Monitoring + incident triage", reqs: [{ kind: "EDU", levelAtLeast: "Associate" }, { kind: "HAS", credentialId: "securityplus" }], tags: ["security","tech"] },
  { id: "career-seceng", title: "Security Engineer", catId: "cat-security", subtitle: "Security architecture + tooling", reqs: [{ kind: "EDU", levelAtLeast: "Bachelor" }, { kind: "HAS", credentialId: "securityplus" }], tags: ["security","tech"] },

  { id: "career-cna", title: "Certified Nursing Assistant (CNA)", catId: "cat-health", subtitle: "Entry patient care support", reqs: [{ kind: "EDU", levelAtLeast: "HS" }, { kind: "HAS", credentialId: "cna" }], tags: ["healthcare","entry"] },
  { id: "career-emt", title: "Emergency Medical Technician (EMT)", catId: "cat-health", subtitle: "Emergency care (field)", reqs: [{ kind: "EDU", levelAtLeast: "HS" }, { kind: "HAS", credentialId: "emt" }], tags: ["healthcare","public-safety"] },
  { id: "career-rn", title: "Registered Nurse (RN)", catId: "cat-health", subtitle: "Hospital / clinic roles", reqs: [{ kind: "EDU", levelAtLeast: "Associate" }, { kind: "MIN", field: "gpa", min: 3.0 }, { kind: "HAS", credentialId: "rn-license" }], tags: ["healthcare"] },

  { id: "career-hvac", title: "HVAC Technician", catId: "cat-trades", subtitle: "Install + service", reqs: [{ kind: "EDU", levelAtLeast: "HS" }, { kind: "HAS", credentialId: "epa-608" }], tags: ["trades"] },
  { id: "career-electrician", title: "Electrician (Apprentice → Journeyman)", catId: "cat-trades", subtitle: "Apprenticeship pathway", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["trades","apprenticeship"] },
  { id: "career-carpenter", title: "Carpenter", catId: "cat-trades", subtitle: "Residential/commercial build", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["trades"] },
  { id: "career-construction-mgr", title: "Construction Manager", catId: "cat-trades", subtitle: "Field leadership", reqs: [{ kind: "EDU", levelAtLeast: "Associate" }, { kind: "HAS", credentialId: "oshar-10" }], tags: ["trades","business"] },

  { id: "career-pm", title: "Project Manager", catId: "cat-business", subtitle: "Delivery + coordination", reqs: [{ kind: "EDU", levelAtLeast: "Associate" }], tags: ["business","pm"] },
  { id: "career-pmp", title: "Senior Project Manager (PMP)", catId: "cat-business", subtitle: "PM leadership", reqs: [{ kind: "EDU", levelAtLeast: "Bachelor" }, { kind: "HAS", credentialId: "pmp" }], tags: ["business","pm"] },
  { id: "career-sales", title: "Sales (B2B)", catId: "cat-business", subtitle: "Revenue + relationships", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["business"] },
  { id: "career-ops", title: "Operations Manager", catId: "cat-business", subtitle: "Process + people", reqs: [{ kind: "EDU", levelAtLeast: "Associate" }], tags: ["business"] },

  { id: "career-bookkeeper", title: "Bookkeeper", catId: "cat-finance", subtitle: "Books + reconciliation", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["finance","entry"] },
  { id: "career-accountant", title: "Accountant", catId: "cat-finance", subtitle: "Financial statements", reqs: [{ kind: "EDU", levelAtLeast: "Bachelor" }], tags: ["finance"] },
  { id: "career-cpa", title: "Certified Public Accountant (CPA)", catId: "cat-finance", subtitle: "Licensure + exams", reqs: [{ kind: "EDU", levelAtLeast: "Bachelor" }, { kind: "HAS", credentialId: "cpa" }], tags: ["finance"] },

  { id: "career-drone", title: "Drone Pilot (Commercial)", catId: "cat-aviation", subtitle: "Media, inspection, mapping", reqs: [{ kind: "EDU", levelAtLeast: "HS" }, { kind: "HAS", credentialId: "part107" }], tags: ["aviation","media"] },
  { id: "career-airline", title: "Airline Pilot Track", catId: "cat-aviation", subtitle: "Commercial/ATP pipeline", reqs: [{ kind: "EDU", levelAtLeast: "SomeCollege" }, { kind: "HAS", credentialId: "faa-med-1" }], tags: ["aviation"] },
  { id: "career-truck", title: "Commercial Driver (CDL)", catId: "cat-aviation", subtitle: "Transportation", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["transportation"] },

  { id: "career-fire", title: "Firefighter", catId: "cat-public", subtitle: "Emergency response", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["public-safety"] },
  { id: "career-leo", title: "Law Enforcement Officer", catId: "cat-public", subtitle: "Police / sheriff roles", reqs: [{ kind: "EDU", levelAtLeast: "HS" }, { kind: "FLAG", field: "canRelocate", mustBe: true }], tags: ["public-safety"] },
  { id: "career-fed", title: "Federal Career (USAJOBS)", catId: "cat-public", subtitle: "Search and apply", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["government"] },

  { id: "career-ux", title: "UX / Product Designer", catId: "cat-creative", subtitle: "Research + design systems", reqs: [{ kind: "EDU", levelAtLeast: "SomeCollege" }], tags: ["creative","tech"] },
  { id: "career-video", title: "Video Editor", catId: "cat-creative", subtitle: "Post-production", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["creative","media"] },
  { id: "career-marketing", title: "Digital Marketer", catId: "cat-creative", subtitle: "Ads, content, analytics", reqs: [{ kind: "EDU", levelAtLeast: "HS" }], tags: ["creative","business"] }
];

const DEFAULT_PROFILE: Profile = {
  name: "",
  email: "",
  phone: "",
  location: "",
  education: "HS",
  gpa: 2.8,
  creditScore: 660,
  wantsRemote: true,
  canRelocate: false,
  credentials: new Set<string>(["securityplus"]),
  skills: new Set<string>(["customer-service"])
};

type StoredCustomGraph = {
  nodes: DataNode[];
  edges: { id: string; source: string; target: string }[];
};

function toStoredProfile(p: Profile) {
  return { ...p, credentials: Array.from(p.credentials), skills: Array.from(p.skills) };
}

function fromStoredProfile(raw: any): Profile {
  return {
    name: String(raw?.name ?? ""),
    email: String(raw?.email ?? ""),
    phone: String(raw?.phone ?? ""),
    location: String(raw?.location ?? ""),
    education: (raw?.education as EducationLevel) ?? DEFAULT_PROFILE.education,
    gpa: Number(raw?.gpa ?? DEFAULT_PROFILE.gpa),
    creditScore: Number(raw?.creditScore ?? DEFAULT_PROFILE.creditScore),
    wantsRemote: Boolean(raw?.wantsRemote ?? DEFAULT_PROFILE.wantsRemote),
    canRelocate: Boolean(raw?.canRelocate ?? DEFAULT_PROFILE.canRelocate),
    credentials: new Set<string>(Array.isArray(raw?.credentials) ? raw.credentials : Array.from(DEFAULT_PROFILE.credentials)),
    skills: new Set<string>(Array.isArray(raw?.skills) ? raw.skills : Array.from(DEFAULT_PROFILE.skills))
  };
}

function loadCustomGraph(): StoredCustomGraph | null {
  try {
    const s = localStorage.getItem(LS_CUSTOM);
    if (!s) return null;
    const obj = JSON.parse(s);
    if (!Array.isArray(obj?.nodes) || !Array.isArray(obj?.edges)) return null;
    return obj;
  } catch {
    return null;
  }
}

function buildBaseGraph(): { nodes: DataNode[]; edges: { id: string; source: string; target: string }[] } {
  const nodes: DataNode[] = [];
  const edges: { id: string; source: string; target: string }[] = [];

  nodes.push({ id: "root", title: "NOVA", kind: "ROOT", subtitle: "Start here: pick a direction, unlock paths", ring: 0, sector: 0, order: 0 });

  const hubs: DataNode[] = [
    { id: "hub-explore", title: "Explore", kind: "HUB", subtitle: "Career branches", ring: 1, sector: 0, order: 0 },
    { id: "hub-qual", title: "Qualifications", kind: "HUB", subtitle: "Credentials + skills", ring: 1, sector: 1, order: 0 },
    { id: "hub-resources", title: "Resources", kind: "HUB", subtitle: "Best places to search", ring: 1, sector: 2, order: 0 }
  ];

  nodes.push(...hubs);

  edges.push({ id: "e-root-explore", source: "root", target: "hub-explore" });
  edges.push({ id: "e-root-qual", source: "root", target: "hub-qual" });
  edges.push({ id: "e-root-res", source: "root", target: "hub-resources" });

  CATEGORIES.forEach((c, idx) => {
    nodes.push({ id: c.id, title: c.title, kind: "CATEGORY", subtitle: "Branch", tags: [...c.tags], ring: 2, sector: idx, order: 0 });
    edges.push({ id: `e-explore-${c.id}`, source: "hub-explore", target: c.id });
  });

  BASE_CREDENTIALS.forEach((cr, idx) => {
    const id = `cred-${cr.id}`;
    nodes.push({ id, title: cr.name, kind: "CREDENTIAL", subtitle: "Unlock key roles", tags: cr.tags, ring: 2, sector: 10 + (idx % 6), order: Math.floor(idx / 6) });
    edges.push({ id: `e-qual-${id}`, source: "hub-qual", target: id });
  });

  BASE_SKILLS.forEach((sk, idx) => {
    const id = `skill-${sk.id}`;
    nodes.push({ id, title: sk.name, kind: "SKILL", subtitle: "Add to resume", tags: sk.tags, ring: 2, sector: 16 + (idx % 6), order: Math.floor(idx / 6) });
    edges.push({ id: `e-qual-${id}`, source: "hub-qual", target: id });
  });

  RESOURCE_LINKS.forEach((r, idx) => {
    const id = `res-${safeId(r.label)}`;
    nodes.push({ id, title: r.label, kind: "RESOURCE", subtitle: "External", tags: r.tags, links: [{ label: "Open", url: r.url }], ring: 2, sector: 22 + (idx % 5), order: Math.floor(idx / 5) });
    edges.push({ id: `e-res-${id}`, source: "hub-resources", target: id });
  });

  CAREERS.forEach((c, idx) => {
    const links = [
      { label: "BLS OOH", url: "https://www.bls.gov/ooh/" },
      { label: "My Next Move", url: "https://www.mynextmove.org/" }
    ];
    if (c.id === "career-fed") links.unshift({ label: "USAJOBS", url: "https://www.usajobs.gov/" });
    if (c.tags.includes("apprenticeship")) links.unshift({ label: "Apprenticeship", url: "https://www.apprenticeship.gov/apprenticeship-job-finder" });

    nodes.push({
      id: c.id,
      title: c.title,
      kind: "CAREER",
      subtitle: c.subtitle,
      tags: [c.catId, ...c.tags],
      requirements: c.reqs,
      links,
      ring: 3,
      sector: CATEGORIES.findIndex(x => x.id === c.catId),
      order: idx
    });

    edges.push({ id: `e-${c.catId}-${c.id}`, source: c.catId, target: c.id });

    c.reqs.forEach((r, rIdx) => {
      if (r.kind === "HAS") {
        edges.push({ id: `e-req-${c.id}-${r.credentialId}-${rIdx}`, source: `cred-${r.credentialId}`, target: c.id });
      }
    });
  });

  return { nodes, edges };
}

function radialPosition(ring: number, sector: number, order: number) {
  const ringRadius = [0, 260, 560, 920][clamp(ring, 0, 3)];
  const sectorCount = 28;
  const angleBase = (Math.PI * 2 * sector) / sectorCount;
  const angle = angleBase + (order % 5) * 0.10 - 0.20;
  const radialJitter = (Math.floor(order / 5) * 70);
  const x = Math.cos(angle) * (ringRadius + radialJitter);
  const y = Math.sin(angle) * (ringRadius + radialJitter);
  return { x, y };
}

type Tab = "Explore" | "Resume" | "Builder" | "Resources";

export default function App() {
  const [rf, setRf] = useState<any>(null);

  const base = useMemo(() => buildBaseGraph(), []);
  const [profile, setProfile] = useState<Profile>(() => {
    const saved = localStorage.getItem(LS_KEY);
    return saved ? fromStoredProfile(JSON.parse(saved)) : DEFAULT_PROFILE;
  });

  const [tab, setTab] = useState<Tab>("Explore");
  const [showLocked, setShowLocked] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [resumeTargetId, setResumeTargetId] = useState<string>("career-data-analyst");
  const [resumeNotes, setResumeNotes] = useState<string>("");

  const [newNodeTitle, setNewNodeTitle] = useState("");
  const [newNodeKind, setNewNodeKind] = useState<NodeKind>("CAREER");
  const [newNodeSubtitle, setNewNodeSubtitle] = useState("");
  const [connectFrom, setConnectFrom] = useState("root");
  const [connectTo, setConnectTo] = useState("");

  function persist(next: Profile) {
    localStorage.setItem(LS_KEY, JSON.stringify(toStoredProfile(next)));
    setProfile(next);
  }

  const customGraph = useMemo(() => loadCustomGraph(), [tab]);

  const computed = useMemo(() => {
    const nodesAll: DataNode[] = [...base.nodes];
    const edgesAll = [...base.edges];

    if (customGraph) {
      for (const n of customGraph.nodes) nodesAll.push(n);
      for (const e of customGraph.edges) edgesAll.push(e);
    }

    const nodes: Node<any>[] = nodesAll.map((n) => {
      const res = evalRequirements(n.requirements, profile);
      const pos = radialPosition(n.ring ?? 2, n.sector ?? 0, n.order ?? 0);

      return {
        id: n.id,
        type: "tree",
        position: pos,
        data: {
          ...n,
          evalStatus:
            n.kind === "ROOT" || n.kind === "HUB" || n.kind === "CATEGORY" || n.kind === "RESOURCE"
              ? "INFO"
              : res.status,
          evalReasons:
            n.kind === "ROOT" || n.kind === "HUB" || n.kind === "CATEGORY" || n.kind === "RESOURCE"
              ? []
              : res.reasons
        }
      };
    });

    const nodeById = new Map(nodes.map(n => [n.id, n]));

    const q = query.trim().toLowerCase();
    const filteredNodes = nodes.filter((n) => {
      const title = String(n.data.title ?? "").toLowerCase();
      const subtitle = String(n.data.subtitle ?? "").toLowerCase();
      const tags = Array.isArray(n.data.tags) ? (n.data.tags as string[]).join(" ").toLowerCase() : "";

      const matchesQuery = q.length === 0 || title.includes(q) || subtitle.includes(q) || tags.includes(q);

      const matchesCategory =
        activeCategory === "all" ||
        (Array.isArray(n.data.tags) && (n.data.tags as string[]).includes(activeCategory)) ||
        n.id === activeCategory;

      const lockOk = showLocked || n.data.evalStatus !== "LOCKED";

      return matchesQuery && matchesCategory && lockOk;
    });

    const visibleIds = new Set(filteredNodes.map(n => n.id));

    const edges: Edge[] = edgesAll
      .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: false,
        style: { stroke: "rgba(213,173,54,.85)", strokeWidth: 2 }
      }));

    const stats = filteredNodes.reduce(
      (acc, n) => {
        acc.total += 1;
        acc[n.data.evalStatus] += 1;
        return acc;
      },
      { total: 0, ELIGIBLE: 0, LOCKED: 0, RISK: 0, INFO: 0 } as any
    );

    const selected = selectedId ? nodeById.get(selectedId) : null;

    return { nodes: filteredNodes, edges, stats, selected };
  }, [base, profile, showLocked, query, activeCategory, selectedId, customGraph]);

  const nodeTypes = useMemo(() => ({ tree: TreeNode }), []);

  function toggleCredential(credId: string, checked: boolean) {
    const next = new Set(profile.credentials);
    if (checked) next.add(credId); else next.delete(credId);
    persist({ ...profile, credentials: next });
  }

  function toggleSkill(skillId: string, checked: boolean) {
    const next = new Set(profile.skills);
    if (checked) next.add(skillId); else next.delete(skillId);
    persist({ ...profile, skills: next });
  }

  function focusNode(id: string) {
    setSelectedId(id);
    if (!rf) return;

    try {
      const n = rf.getNode?.(id);
      rf.setCenter?.(0, 0, { zoom: 0.7, duration: 250 });

      if (n?.positionAbsolute) {
        rf.setCenter?.(n.positionAbsolute.x, n.positionAbsolute.y, { zoom: 0.9, duration: 450 });
      }
    } catch {
      // ignore
    }
  }

  function clearCustomGraph() {
    localStorage.removeItem(LS_CUSTOM);
    alert("Custom graph cleared.");
  }

  function exportCustomGraph() {
    const cg = loadCustomGraph();
    if (!cg) return alert("No custom graph found.");
    downloadText("nova-custom-graph.json", JSON.stringify(cg, null, 2));
  }

  function importCustomGraph(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result ?? ""));
        if (!Array.isArray(obj?.nodes) || !Array.isArray(obj?.edges)) throw new Error("Invalid file");
        localStorage.setItem(LS_CUSTOM, JSON.stringify(obj));
        alert("Imported custom graph.");
      } catch {
        alert("Import failed. Expected JSON with { nodes: [], edges: [] }.");
      }
    };
    reader.readAsText(file);
  }

  function addCustomNode() {
    const title = newNodeTitle.trim();
    if (!title) return alert("Enter a title.");

    const id = `custom-${safeId(title)}-${Math.floor(Math.random() * 100000)}`;

    const n: DataNode = {
      id,
      title,
      kind: newNodeKind,
      subtitle: newNodeSubtitle.trim() || "Custom",
      tags: ["custom"],
      ring: 3,
      sector: 5,
      order: 0
    };

    const cg = loadCustomGraph() ?? { nodes: [], edges: [] };
    cg.nodes.push(n);

    cg.edges.push({ id: `ce-${id}-${connectFrom || "root"}`, source: connectFrom || "root", target: id });
    if (connectTo && connectTo !== id) cg.edges.push({ id: `ce-${id}-${connectTo}`, source: id, target: connectTo });

    localStorage.setItem(LS_CUSTOM, JSON.stringify(cg));
    setNewNodeTitle("");
    setNewNodeSubtitle("");
    alert("Custom node added.");
  }

  const careerNodes = useMemo(() => CAREERS.map(c => ({ id: c.id, title: c.title })), []);

  function buildResumeText(): string {
    const target = CAREERS.find(c => c.id === resumeTargetId);
    const creds = BASE_CREDENTIALS.filter(c => profile.credentials.has(c.id)).map(c => c.name);
    const skills = BASE_SKILLS.filter(s => profile.skills.has(s.id)).map(s => s.name);

    const lines: string[] = [];
    lines.push(profile.name ? profile.name : "YOUR NAME");
    lines.push([profile.location, profile.phone, profile.email].filter(Boolean).join(" • "));
    lines.push("");
    lines.push("SUMMARY");
    lines.push(target ? `Aspiring ${target.title} with a focus on building a credential-backed pathway.` : "Focused professional building a credential-backed pathway.");
    if (resumeNotes.trim()) lines.push(resumeNotes.trim());
    lines.push("");
    lines.push("SKILLS");
    lines.push(skills.length ? skills.join(" • ") : "(add skills from Builder → Skills)");
    lines.push("");
    lines.push("CERTIFICATIONS");
    lines.push(creds.length ? creds.join(" • ") : "(add credentials from Builder → Credentials)");
    lines.push("");
    lines.push("PROJECTS / EXPERIENCE");
    lines.push("- Add 2–4 real examples (projects, jobs, volunteer, school labs, etc.)");
    lines.push("- Quantify outcomes (time saved, revenue, accuracy, tickets closed, customers served, etc.)");
    lines.push("");
    lines.push("EDUCATION");
    lines.push(`- Highest level: ${profile.education}`);
    lines.push("");
    return lines.join("\n");
  }

  const resumeText = useMemo(() => buildResumeText(), [profile, resumeTargetId, resumeNotes]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1 className="brandTitle">NOVA</h1>
            <div className="brandSub">Career skill tree • dark navy • gold lines • white text</div>
          </div>
          <div className="badge">v0.2</div>
        </div>

        <div className="tabs">
          {(["Explore","Resume","Builder","Resources"] as Tab[]).map(t => (
            <button key={t} className={"tabBtn " + (tab === t ? "tabBtnActive" : "")} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Explore" ? (
          <>
            <div className="section">
              <div className="sectionTitle">Search & Filter</div>

              <div className="row">
                <div className="label">Search<span className="sub">Title, tags, subtitle</span></div>
                <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g., nurse, cloud, trade" />
              </div>

              <div className="row">
                <div className="label">Category<span className="sub">Show a branch</span></div>
                <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)}>
                  <option value="all">All</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="row">
                <div className="label">Show locked<span className="sub">Shaded until qualified</span></div>
                <input className="checkbox" type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} />
              </div>

              <div className="smallHint">Click a node to see details. Use the minimap to jump between branches.</div>
            </div>

            <div className="section">
              <div className="sectionTitle">Profile gates</div>

              <div className="row">
                <div className="label">Education<span className="sub">Affects many paths</span></div>
                <select value={profile.education} onChange={(e) => persist({ ...profile, education: e.target.value as EducationLevel })}>
                  {EDU_ORDER.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className="row">
                <div className="label">GPA<span className="sub">Numeric threshold gate</span></div>
                <input className="field" type="number" step="0.1" value={profile.gpa} onChange={(e) => persist({ ...profile, gpa: Number(e.target.value) })} />
              </div>

              <div className="row">
                <div className="label">Credit score<span className="sub">Future: screening gates</span></div>
                <input className="field" type="number" step="1" value={profile.creditScore} onChange={(e) => persist({ ...profile, creditScore: Number(e.target.value) })} />
              </div>

              <div className="row">
                <div className="label">Wants remote<span className="sub">Preference, not a lock</span></div>
                <input className="checkbox" type="checkbox" checked={profile.wantsRemote} onChange={(e) => persist({ ...profile, wantsRemote: e.target.checked })} />
              </div>

              <div className="row">
                <div className="label">Can relocate<span className="sub">Preference/constraint</span></div>
                <input className="checkbox" type="checkbox" checked={profile.canRelocate} onChange={(e) => persist({ ...profile, canRelocate: e.target.checked })} />
              </div>
            </div>

            <div className="section">
              <div className="sectionTitle">Node details</div>
              {computed.selected ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{computed.selected.data.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{computed.selected.data.subtitle ?? computed.selected.data.kind}</div>

                  {computed.selected.data.links?.length ? (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {computed.selected.data.links.map((l: any, i: number) => (
                        <a key={i} href={l.url} target="_blank" rel="noreferrer" className="btnGhost" style={{ padding: "7px 10px", borderRadius: 999 }}>
                          {l.label}
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {computed.selected.data.evalReasons?.length ? (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
                      {computed.selected.data.evalReasons.map((r: string, i: number) => (
                        <div key={i}>• {r}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="smallHint">No requirements on this node.</div>
                  )}
                </>
              ) : (
                <div className="smallHint">Click a node in the graph to see details here.</div>
              )}
            </div>
          </>
        ) : null}

        {tab === "Resume" ? (
          <>
            <div className="section">
              <div className="sectionTitle">Resume builder</div>

              <div className="row">
                <div className="label">Target role<span className="sub">Select a career</span></div>
                <select value={resumeTargetId} onChange={(e) => setResumeTargetId(e.target.value)}>
                  {careerNodes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              <div className="row">
                <div className="label">Name</div>
                <input className="field" value={profile.name} onChange={(e) => persist({ ...profile, name: e.target.value })} placeholder="Your name" />
              </div>

              <div className="row">
                <div className="label">Email</div>
                <input className="field" value={profile.email} onChange={(e) => persist({ ...profile, email: e.target.value })} placeholder="name@email.com" />
              </div>

              <div className="row">
                <div className="label">Phone</div>
                <input className="field" value={profile.phone} onChange={(e) => persist({ ...profile, phone: e.target.value })} placeholder="(555) 555-5555" />
              </div>

              <div className="row">
                <div className="label">Location</div>
                <input className="field" value={profile.location} onChange={(e) => persist({ ...profile, location: e.target.value })} placeholder="City, ST" />
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="label">Optional notes</div>
                <textarea value={resumeNotes} onChange={(e) => setResumeNotes(e.target.value)} placeholder="1–2 lines about what you want to highlight" />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button className="btn" onClick={() => navigator.clipboard.writeText(resumeText)}>Copy</button>
                <button className="btnGhost" onClick={() => downloadText("resume.txt", resumeText)}>Download .txt</button>
              </div>
            </div>

            <div className="section">
              <div className="sectionTitle">Preview</div>
              <textarea readOnly value={resumeText} />
            </div>
          </>
        ) : null}

        {tab === "Builder" ? (
          <>
            <div className="section">
              <div className="sectionTitle">Add custom node</div>

              <div className="row">
                <div className="label">Title</div>
                <input className="field" value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)} placeholder="e.g., Welding Cert" />
              </div>

              <div className="row">
                <div className="label">Kind</div>
                <select value={newNodeKind} onChange={(e) => setNewNodeKind(e.target.value as NodeKind)}>
                  {(["CAREER","CREDENTIAL","SKILL","SCHOOL","RESOURCE","CATEGORY"] as NodeKind[]).map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>

              <div className="row">
                <div className="label">Subtitle</div>
                <input className="field" value={newNodeSubtitle} onChange={(e) => setNewNodeSubtitle(e.target.value)} placeholder="Short note" />
              </div>

              <div className="row">
                <div className="label">Connect from</div>
                <select value={connectFrom} onChange={(e) => setConnectFrom(e.target.value)}>
                  <option value="root">root</option>
                  <option value="hub-explore">hub-explore</option>
                  <option value="hub-qual">hub-qual</option>
                  <option value="hub-resources">hub-resources</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              <div className="row">
                <div className="label">Connect to (optional)</div>
                <select value={connectTo} onChange={(e) => setConnectTo(e.target.value)}>
                  <option value="">(none)</option>
                  {careerNodes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn" onClick={addCustomNode}>Add node</button>
                <button className="btnGhost" onClick={exportCustomGraph}>Export custom</button>
                <label className="btnGhost" style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  Import
                  <input
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importCustomGraph(f);
                      (e.target as HTMLInputElement).value = "";
                    }}
                  />
                </label>
                <button className="btnGhost" onClick={clearCustomGraph}>Clear</button>
              </div>

              <div className="smallHint">Custom nodes are stored in localStorage. Export/Import lets you move them between machines.</div>
            </div>

            <div className="section">
              <div className="sectionTitle">Qualifications toggles</div>

              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>Credentials</div>
              {BASE_CREDENTIALS.map(c => (
                <div className="row" key={c.id}>
                  <div className="label">{c.name}</div>
                  <input className="checkbox" type="checkbox" checked={profile.credentials.has(c.id)} onChange={(e) => toggleCredential(c.id, e.target.checked)} />
                </div>
              ))}

              <div style={{ height: 10 }} />

              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>Skills</div>
              {BASE_SKILLS.map(s => (
                <div className="row" key={s.id}>
                  <div className="label">{s.name}</div>
                  <input className="checkbox" type="checkbox" checked={profile.skills.has(s.id)} onChange={(e) => toggleSkill(s.id, e.target.checked)} />
                </div>
              ))}
            </div>
          </>
        ) : null}

        {tab === "Resources" ? (
          <>
            <div className="section">
              <div className="sectionTitle">Best places to search</div>
              <div className="smallHint">Reliable starting points for jobs, schools, certifications, and occupational requirements.</div>

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {RESOURCE_LINKS.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noreferrer" className="btnGhost" style={{ display: "block", textDecoration: "none" }}>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{r.label}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.url}</div>
                  </a>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </aside>

      <main className="canvas">
        <div className="topbar">
          <div className="chip">Nodes: <strong>{computed.stats.total}</strong></div>
          <div className="chip">Available: <strong>{computed.stats.ELIGIBLE}</strong></div>
          <div className="chip">Maybe: <strong>{computed.stats.RISK}</strong></div>
          <div className="chip">Locked: <strong>{computed.stats.LOCKED}</strong></div>
        </div>

        <ReactFlow
          nodes={computed.nodes}
          onInit={(instance) => setRf(instance)}
          edges={computed.edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            setSelectedId(node.id);
            focusNode(node.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.20 }}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap nodeColor={() => "rgba(213,173,54,.55)"} maskColor="rgba(0,0,0,.35)" />
          <Controls />
          <Background gap={28} size={1} color="rgba(213,173,54,.16)" />
        </ReactFlow>
      </main>
    </div>
  );
}
