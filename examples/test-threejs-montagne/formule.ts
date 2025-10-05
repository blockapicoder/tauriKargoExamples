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

  el.innerHTML = `
\\[
\\begin{aligned}
&\\text{Avec } d(\\mathbf a,\\mathbf b)=\\lVert\\mathbf a-\\mathbf b\\rVert^{2},\\quad p_i=(x_i,y_i).\\\\[2mm]
&F(x,y)=\\sum_{i=1}^{n} h_i\\,\\prod_{\\substack{j=1\\\\ j\\ne i}}^{n}
\\sin\\!\\left(\\pi\\,\\frac{d\\big((x,y),\\,p_j\\big)}{d\\big((x,y),\\,p_j\\big)+d\\big(p_i,\\,p_j\\big)}\\right).
\\end{aligned}
\\]`;
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

