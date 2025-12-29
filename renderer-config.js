if (window.marked) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    smartLists: true,
    tables: true
  });

  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']],
      processEscapes: true,
      processEnvironments: true,
      tags: 'ams',
      packages: { '[+]' : ['noerrors'] },
      ignoreClass: 'language-.*|hljs|no-mathjax',
      processClass: 'mathjax-process'
    },
    options: {
      skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    }
  };
}