import { useState, useEffect } from "react";

// ── Config ───────────────────────────────────────────────────────────────────
// Change this to your deployed backend URL when you go live
const API_BASE = "http://localhost:8000";

const injectFonts = () => {
  if (document.getElementById("fmr-fonts")) return;
  const s = document.createElement("style");
  s.id = "fmr-fonts";
  s.textContent = `@import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap');
  * { box-sizing: border-box; }
  input, select, button { font-family: 'Courier Prime', 'Courier New', monospace; }
  input:focus, select:focus { outline: 1px solid #c4973a !important; border-color: #c4973a !important; }
  select option { background: #0c0b08; color: #e8dcc8; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0c0b08; }
  ::-webkit-scrollbar-thumb { background: #3a3428; border-radius: 3px; }
  @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:0.7} }
  @keyframes fadeSlideUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }`;
  document.head.appendChild(s);
};
injectFonts();

const GENRES = [
  "lo-fi indie folk","dream pop","shoegaze","twee pop",
  "midwest emo","noise rock","slowcore","chillwave",
  "witch house","bedroom pop","post-punk revival","math rock",
  "trip-hop","neo-soul","sadcore","ethereal wave"
];

const ERAS = [
  "1995–2000","2000–2005","2005–2010",
  "2008–2013","2010–2015","2012–2016"
];

const QUICK_SEARCHES = [
  { genre:"dream pop",      era:"2010–2015" },
  { genre:"shoegaze",       era:"2005–2010" },
  { genre:"midwest emo",    era:"2008–2013" },
  { genre:"bedroom pop",    era:"2012–2016" },
];

// ── Pipeline status bar ───────────────────────────────────────────────────────
function PipelineBar({ stage }) {
  const stages = [
    { key:"lastfm",      label:"LAST.FM",       icon:"🎵" },
    { key:"musicbrainz", label:"MUSICBRAINZ",   icon:"📀" },
    { key:"brave",       label:"SILENCE CHECK", icon:"📡" },
    { key:"playwright",  label:"BANDCAMP",      icon:"🕷️" },
    { key:"generate",    label:"PROFILING",     icon:"🧠" },
  ];
  const idx = stages.findIndex(s => s.key === stage);
  return (
    <div style={{ maxWidth:640, margin:"0 auto 32px", padding:"0 16px" }}>
      <div style={{
        background:"#161310", border:"1px solid #3a3428",
        borderRadius:3, padding:"16px 20px",
        display:"flex", justifyContent:"space-between", gap:8,
        flexWrap:"wrap",
      }}>
        {stages.map((s, i) => {
          const done    = i < idx;
          const active  = i === idx;
          const pending = i > idx;
          const color   = done ? "#7a9e7e" : active ? "#c4973a" : "#3a3428";
          return (
            <div key={s.key} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, flex:1, minWidth:60 }}>
              <span style={{ fontSize:16 }}>{s.icon}</span>
              <span style={{ fontSize:8, color, letterSpacing:1.5, textAlign:"center" }}>{s.label}</span>
              <div style={{ width:"100%", height:2, background: done ? "#7a9e7e" : active ? "#c4973a" : "#2e2820", borderRadius:1 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Scout score ring ──────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const color = score >= 8 ? "#c4973a" : score >= 6 ? "#7a9e7e" : "#6b5f47";
  const label = score >= 8 ? "HOT LEAD" : score >= 6 ? "WORTH IT" : "COLD";
  return (
    <div style={{ position:"absolute", top:20, right:20, display:"flex", flexDirection:"column", alignItems:"center" }}>
      <div style={{
        width:58, height:58, borderRadius:"50%",
        border:`2.5px solid ${color}`, display:"flex",
        flexDirection:"column", alignItems:"center", justifyContent:"center",
        transform:"rotate(8deg)",
      }}>
        <span style={{ fontSize:22, fontWeight:700, color, fontFamily:"'Special Elite',serif", lineHeight:1 }}>{score}</span>
        <span style={{ fontSize:8, color, letterSpacing:1 }}>/10</span>
      </div>
      <span style={{ fontSize:7, color, letterSpacing:1.5, marginTop:4, transform:"rotate(8deg)" }}>{label}</span>
    </div>
  );
}

// ── Case file card ────────────────────────────────────────────────────────────
function CaseCard({ artist, index }) {
  const caseNum = String(7000 + index * 137).padStart(5,"0");
  return (
    <div style={{
      background:"#1a1713", border:"1px solid #3a3428",
      borderRadius:3, padding:"22px 20px",
      position:"relative", animation:"fadeSlideUp 0.4s ease both",
      animationDelay:`${index * 90}ms`,
    }}>
      <ScoreRing score={artist.scoutScore} />

      <div style={{ fontSize:9, color:"#6b5f47", letterSpacing:2.5, marginBottom:10 }}>
        CASE #{caseNum} · {(artist.genre || "").toUpperCase()}
      </div>

      <h2 style={{
        fontFamily:"'Special Elite', serif",
        fontSize:"clamp(17px, 3vw, 21px)", color:"#e8dcc8",
        margin:"0 0 10px", paddingRight:70, lineHeight:1.2,
      }}>
        {artist.name}
      </h2>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16, alignItems:"center" }}>
        <span style={{
          fontSize:10, background:"#2a2218", color:"#c4973a",
          padding:"3px 8px", borderRadius:2, letterSpacing:1, fontWeight:700,
        }}>
          PEAK {artist.peakYear}
        </span>
        {artist.location && artist.location !== "Unknown" && (
          <span style={{ fontSize:10, color:"#6b5f47" }}>📍 {artist.location}</span>
        )}
      </div>

      <div style={{ borderTop:"1px solid #2e2820", marginBottom:14 }} />

      <p style={{ fontSize:13, color:"#b5a88a", lineHeight:1.7, margin:"0 0 16px" }}>
        {artist.buzzDescription}
      </p>

      <div style={{
        background:"#111009", borderLeft:"2.5px solid #c4973a",
        padding:"10px 14px", borderRadius:"0 2px 2px 0", marginBottom:12,
      }}>
        <div style={{ fontSize:8, color:"#c4973a", letterSpacing:2.5, marginBottom:5 }}>LAST KNOWN ACTIVITY</div>
        <p style={{ fontSize:12, color:"#9a8e78", margin:0, lineHeight:1.5 }}>{artist.lastKnownActivity}</p>
      </div>

      <div style={{
        background:"#111009", borderLeft:"2.5px solid #4a5e4f",
        padding:"10px 14px", borderRadius:"0 2px 2px 0", marginBottom:16,
      }}>
        <div style={{ fontSize:8, color:"#7a9e7e", letterSpacing:2.5, marginBottom:5 }}>WHERE ARE THEY NOW</div>
        <p style={{ fontSize:12, color:"#9a8e78", margin:0, lineHeight:1.5 }}>{artist.currentStatus}</p>
      </div>

      <div style={{ borderTop:"1px solid #2e2820", paddingTop:12 }}>
        <span style={{ fontSize:11, color:"#5a5040", fontStyle:"italic" }}>Scout: </span>
        <span style={{ fontSize:11, color:"#8a7e6a", fontStyle:"italic" }}>{artist.scoutReason}</span>
      </div>
    </div>
  );
}

// ── Loading skeletons ─────────────────────────────────────────────────────────
function LoadingGrid() {
  return (
    <div style={{
      maxWidth:1100, margin:"0 auto",
      display:"grid",
      gridTemplateColumns:"repeat(auto-fill, minmax(290px, 1fr))",
      gap:20,
    }}>
      {[0,1,2,3].map(i => (
        <div key={i} style={{
          background:"#1a1713", border:"1px solid #2e2820",
          borderRadius:3, padding:"22px 20px", height:330,
          animation:"pulse 1.5s ease infinite",
          animationDelay:`${i * 200}ms`,
        }}>
          <div style={{ height:8, width:80, background:"#2e2820", borderRadius:2, marginBottom:16 }} />
          <div style={{ height:22, width:"55%", background:"#2e2820", borderRadius:2, marginBottom:12 }} />
          <div style={{ height:8, width:40, background:"#2e2820", borderRadius:2, marginBottom:20 }} />
          <div style={{ height:1, background:"#2e2820", marginBottom:16 }} />
          <div style={{ height:8, background:"#2e2820", borderRadius:2, marginBottom:8 }} />
          <div style={{ height:8, background:"#2e2820", borderRadius:2, marginBottom:8, width:"80%" }} />
          <div style={{ height:8, background:"#2e2820", borderRadius:2, width:"65%" }} />
        </div>
      ))}
    </div>
  );
}

// ── Pipeline debug badge ──────────────────────────────────────────────────────
function PipelineBadge({ pipeline }) {
  if (!pipeline) return null;
  return (
    <div style={{
      maxWidth:1100, margin:"0 auto 28px",
      display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap",
    }}>
      {[
        { label:"Last.fm hits",     value: pipeline.lastfm_results },
        { label:"MB checked",       value: pipeline.musicbrainz_checked },
        { label:"Era matches",      value: pipeline.era_matches },
        { label:"Went quiet",       value: pipeline.went_quiet },
        { label:"Profiles",       value: pipeline.profiles_generated },
      ].map(({ label, value }) => (
        <div key={label} style={{
          background:"#161310", border:"1px solid #2e2820",
          borderRadius:2, padding:"6px 14px",
          display:"flex", gap:8, alignItems:"center",
        }}>
          <span style={{ fontSize:9, color:"#4a3f2f", letterSpacing:1.5 }}>{label}</span>
          <span style={{ fontSize:12, color:"#c4973a", fontWeight:700 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [genre, setGenre]     = useState("");
  const [era, setEra]         = useState("2010–2015");
  const [artists, setArtists] = useState([]);
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage]     = useState("serp");
  const [error, setError]     = useState(null);
  const [dots, setDots]       = useState(".");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 450);
    return () => clearInterval(iv);
  }, [loading]);

  // Simulate pipeline stage progression while waiting
  useEffect(() => {
    if (!loading) return;
    const stages = ["lastfm","musicbrainz","brave","playwright","generate"];
    let i = 0;
    const iv = setInterval(() => {
      i = Math.min(i + 1, stages.length - 1);
      setStage(stages[i]);
    }, 4500);
    return () => clearInterval(iv);
  }, [loading]);

  const search = async (overrideGenre, overrideEra) => {
    const g = (overrideGenre || genre).trim();
    const e = (overrideEra   || era).trim();
    if (!g || loading) return;

    setLoading(true);
    setError(null);
    setArtists([]);
    setPipeline(null);
    setSearched(true);
    setStage("serp");

    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre: g, era: e }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      setArtists(data.artists || []);
      setPipeline(data.pipeline || null);
    } catch (err) {
      setError(err.message || "Failed to reach backend. Is the server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight:"100vh", background:"#0c0b08",
      fontFamily:"'Courier Prime', 'Courier New', monospace",
      paddingBottom:80,
    }}>
      <div style={{ position:"relative", zIndex:1 }}>

        {/* Header */}
        <header style={{ textAlign:"center", padding:"clamp(32px, 6vw, 64px) 16px 32px" }}>
          <div style={{ fontSize:9, color:"#3a3020", letterSpacing:4, marginBottom:16, textTransform:"uppercase" }}>
          Last.fm · MusicBrainz · Brave Search · Playwright · Groq
          </div>
          <h1 style={{
            fontFamily:"'Special Elite', serif",
            fontSize:"clamp(2.4rem, 8vw, 5rem)",
            color:"#e8dcc8", margin:0, lineHeight:0.9,
          }}>
            FORGOTTEN<br />
            <span style={{ color:"#c4973a" }}>MUSICIAN</span><br />
            RESURRECTOR
          </h1>
          <div style={{ marginTop:20, display:"flex", alignItems:"center", justifyContent:"center", gap:16 }}>
            <div style={{ height:"1px", width:48, background:"#2e2820" }} />
            <p style={{ color:"#4a3f2f", fontSize:10, margin:0, letterSpacing:3 }}>
              COLD CASE FILES FOR INDIE SCOUTS
            </p>
            <div style={{ height:"1px", width:48, background:"#2e2820" }} />
          </div>
        </header>

        {/* Search form */}
        <div style={{ maxWidth:580, margin:"0 auto 52px", padding:"0 16px" }}>
          <div style={{
            background:"#161310", border:"1px solid #3a3428",
            borderRadius:3, padding:"24px 24px 20px",
          }}>
            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:9, color:"#c4973a", letterSpacing:3, display:"block", marginBottom:10 }}>
                GENRE / SCENE
              </label>
              <input
                type="text"
                placeholder="dream pop, midwest emo, shoegaze..."
                value={genre}
                onChange={e => setGenre(e.target.value)}
                onKeyDown={e => e.key === "Enter" && search()}
                list="genre-list"
                style={{
                  width:"100%", background:"#0c0b08",
                  border:"1px solid #3a3428", color:"#e8dcc8",
                  padding:"11px 14px", fontSize:14, borderRadius:2,
                }}
              />
              <datalist id="genre-list">
                {GENRES.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>

            <div style={{ marginBottom:22 }}>
              <label style={{ fontSize:9, color:"#c4973a", letterSpacing:3, display:"block", marginBottom:10 }}>
                ERA
              </label>
              <div style={{ position:"relative" }}>
                <select
                  value={era}
                  onChange={e => setEra(e.target.value)}
                  style={{
                    width:"100%", background:"#0c0b08",
                    border:"1px solid #3a3428", color:"#e8dcc8",
                    padding:"11px 14px", fontSize:14,
                    borderRadius:2, cursor:"pointer",
                    appearance:"none", WebkitAppearance:"none",
                  }}
                >
                  {ERAS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <span style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", color:"#6b5f47", pointerEvents:"none", fontSize:10 }}>▼</span>
              </div>
            </div>

            <button
              onClick={() => search()}
              disabled={loading || !genre.trim()}
              style={{
                width:"100%",
                background: loading || !genre.trim() ? "#1a1713" : "#c4973a",
                color:       loading || !genre.trim() ? "#4a3f2f" : "#0c0b08",
                border:      loading || !genre.trim() ? "1px solid #2e2820" : "none",
                padding:"13px 24px", fontSize:12, fontWeight:700,
                letterSpacing:3, cursor: loading || !genre.trim() ? "not-allowed" : "pointer",
                borderRadius:2, textTransform:"uppercase", transition:"all 0.2s",
              }}
            >
              {loading ? `SEARCHING ARCHIVES${dots}` : "OPEN COLD CASES"}
            </button>
          </div>
        </div>

        {/* Pipeline progress */}
        {loading && <PipelineBar stage={stage} />}

        {/* Error */}
        {error && (
          <div style={{ maxWidth:580, margin:"0 auto 32px", padding:"0 16px" }}>
            <div style={{
              background:"#180f0f", border:"1px solid #4a1f1f",
              borderRadius:3, padding:"14px 20px",
              fontSize:12, color:"#9a5a5a", lineHeight:1.6, textAlign:"center",
            }}>
              ⚠ {error}
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && <div style={{ padding:"0 16px" }}><LoadingGrid /></div>}

        {/* Results */}
        {!loading && artists.length > 0 && (
          <div style={{ padding:"0 16px" }}>
            <div style={{ maxWidth:1100, margin:"0 auto 20px", display:"flex", alignItems:"center", gap:20 }}>
              <div style={{ flex:1, height:"1px", background:"#2e2820" }} />
              <span style={{ fontSize:9, color:"#6b5f47", letterSpacing:3, whiteSpace:"nowrap" }}>
                {artists.length} CASE FILES RETRIEVED
              </span>
              <div style={{ flex:1, height:"1px", background:"#2e2820" }} />
            </div>

            <PipelineBadge pipeline={pipeline} />

            <div style={{
              maxWidth:1100, margin:"0 auto",
              display:"grid",
              gridTemplateColumns:"repeat(auto-fill, minmax(290px, 1fr))",
              gap:20,
            }}>
              {artists.map((a, i) => <CaseCard key={i} artist={a} index={i} />)}
            </div>

            <div style={{ maxWidth:1100, margin:"36px auto 0", textAlign:"center" }}>
              <button
                onClick={() => search()}
                style={{
                  background:"transparent", border:"1px solid #3a3428",
                  color:"#6b5f47", padding:"11px 32px",
                  fontSize:11, letterSpacing:2.5, cursor:"pointer",
                  borderRadius:2, fontFamily:"'Courier Prime', monospace",
                  textTransform:"uppercase", transition:"all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#c4973a"; e.currentTarget.style.color="#c4973a"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#3a3428"; e.currentTarget.style.color="#6b5f47"; }}
              >
                SEARCH AGAIN
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !searched && (
          <div style={{ textAlign:"center", padding:"0 16px" }}>
            <div style={{ fontSize:10, color:"#2e2820", letterSpacing:3, marginBottom:32 }}>
              — ENTER A GENRE TO BEGIN, OR TRY ONE OF THESE —
            </div>
            <div style={{
              maxWidth:440, margin:"0 auto",
              display:"grid",
              gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",
              gap:10,
            }}>
              {QUICK_SEARCHES.map(({ genre: g, era: e }) => (
                <button
                  key={g}
                  onClick={() => { setGenre(g); setEra(e); search(g, e); }}
                  style={{
                    background:"#161310", border:"1px solid #2e2820",
                    color:"#5a4f3c", padding:"12px 14px",
                    fontSize:11, cursor:"pointer", borderRadius:2,
                    fontFamily:"'Courier Prime', monospace",
                    transition:"all 0.2s", textAlign:"center", lineHeight:1.6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="#3a3428"; e.currentTarget.style.color="#9a8e78"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="#2e2820"; e.currentTarget.style.color="#5a4f3c"; }}
                >
                  {g}<br />
                  <span style={{ fontSize:9, letterSpacing:1, opacity:0.6 }}>{e}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <footer style={{
          textAlign:"center", marginTop:80, fontSize:8,
          color:"#2e2820", letterSpacing:2, padding:"0 16px",
        }}>
          LAST.FM · MUSICBRAINZ · BRAVE SEARCH · PLAYWRIGHT · GROQ LLAMA 3.3 70B
        </footer>
      </div>
    </div>
  );
}