// ---------- MathJax + panneau LaTeX ----------



let mathJaxReadyPromise: Promise<void> | null = null;

function ensureMathJax(): Promise<void> {
  // Déjà chargé et prêt
  if ((window as any).MathJax?.typesetPromise) return Promise.resolve();

  // Déjà en cours de chargement
  if (mathJaxReadyPromise) return mathJaxReadyPromise;

  // Configurer AVANT d’injecter le script
  (window as any).MathJax = {
    tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
    svg: { fontCache: 'global' }
  };

  mathJaxReadyPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.id = 'mathjax-script';
    s.async = true;
    s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('Échec de chargement MathJax')));
    document.head.appendChild(s);
  });

  return mathJaxReadyPromise;
}

function setStaticFormula() {
  const el = document.getElementById('formule');
  if (!el) return;
const latex = `\(\displaystyle d(\mathbf a,\mathbf b)=\lVert \mathbf a-\mathbf b\rVert^{2},\quad
w_i(p)=\prod_{j=1,\, j\ne i}^{n}\sin\!\left(\pi\,\frac{d(p,p_j)}{d(p,p_j)+d(p_i,p_j)}\right),\quad
\tilde F(p)=\frac{\sum_{i=1}^{n} h_i\, w_i(p)}{\sum_{i=1}^{n} w_i(p)}\)
`;
const latexInline = "\\(\\displaystyle d(\\mathbf a,\\mathbf b)=\\lVert \\mathbf a-\\mathbf b\\rVert^{2},\\quad w_i(p)=\\prod_{j=1,\\, j\\ne i}^{n}\\sin\\!\\left(\\pi\\,\\frac{d(p,p_j)}{d(p,p_j)+d(p_i,p_j)}\\right),\\quad \\tilde F(p)=\\frac{\\sum_{i=1}^{n} h_i\\, w_i(p)}{\\sum_{i=1}^{n} w_i(p)}\\)";

  el.innerHTML = latexInline
}

export async function updateFormulaPanel() {
  setStaticFormula();            // injecte le LaTeX dans #formule
  await ensureMathJax();         // attend le chargement via listener 'load'
  const el = document.getElementById('formule');
  if (!el) return;
  if ((window as any).MathJax?.typesetPromise) {
    await (window as any).MathJax.typesetPromise([el]);
  } else if ((window as any).MathJax?.typeset) {
    (window as any).MathJax.typeset([el]);
  }
}

