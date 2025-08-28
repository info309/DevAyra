import React, { useRef, useEffect } from 'react';

interface IsolatedEmailContentProps {
  content: string;
}

const IsolatedEmailContent: React.FC<IsolatedEmailContentProps> = ({ content }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (doc) {
        // Create completely isolated HTML with reset styles
        const isolatedHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              /* Complete CSS reset */
              * {
                margin: 0;
                padding: 0;
                border: 0;
                font-size: 100%;
                font: inherit;
                vertical-align: baseline;
                box-sizing: border-box;
              }
              
              /* Base styles */
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: 14px;
                line-height: 1.5;
                color: #1f2937;
                background: transparent;
                margin: 16px;
                padding: 0;
                overflow-wrap: break-word;
                word-wrap: break-word;
                min-height: 100vh;
              }
              
              /* Typography */
              p { margin-bottom: 12px; }
              h1, h2, h3, h4, h5, h6 { margin-bottom: 12px; font-weight: 600; }
              h1 { font-size: 20px; }
              h2 { font-size: 18px; }
              h3 { font-size: 16px; }
              
              /* Links */
              a {
                color: #3b82f6;
                text-decoration: underline;
              }
              
              /* Images */
              img {
                max-width: 100% !important;
                height: auto !important;
                border-radius: 4px;
                display: block;
                margin: 8px 0;
              }
              
              /* Tables */
              table {
                border-collapse: collapse;
                width: 100%;
                margin: 12px 0;
              }
              
              td, th {
                padding: 8px;
                text-align: left;
                border-bottom: 1px solid #e5e7eb;
              }
              
              /* Lists */
              ul, ol {
                margin: 12px 0;
                padding-left: 20px;
              }
              
              li {
                margin-bottom: 4px;
              }
              
              /* Block elements */
              blockquote {
                margin: 12px 0;
                padding: 8px 16px;
                border-left: 4px solid #e5e7eb;
                background: #f9fafb;
              }
              
              /* Prevent any CSS from affecting parent */
              html, body {
                isolation: isolate;
                contain: layout style paint;
              }
              
              /* Hide or neutralize potentially problematic elements */
              style, script, link[rel="stylesheet"] {
                display: none !important;
              }
            </style>
          </head>
          <body>
            ${content || '<p style="color: #6b7280; font-style: italic;">No content available</p>'}
          </body>
          </html>
        `;
        
        doc.open();
        doc.write(isolatedHTML);
        doc.close();
        
        // Auto-resize iframe to content height
        const resizeIframe = () => {
          const body = doc.body;
          if (body) {
            const height = Math.max(
              body.scrollHeight,
              body.offsetHeight,
              300 // minimum height
            );
            iframe.style.height = `${height + 32}px`; // Add padding
          }
        };
        
        // Initial resize
        setTimeout(resizeIframe, 100);
        
        // Resize on content changes
        const observer = new MutationObserver(resizeIframe);
        observer.observe(doc.body, { 
          childList: true, 
          subtree: true, 
          attributes: true 
        });
        
        // Prevent navigation
        iframe.contentWindow?.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'A') {
            e.preventDefault();
            const href = (target as HTMLAnchorElement).href;
            if (href && href.startsWith('http')) {
              window.open(href, '_blank', 'noopener,noreferrer');
            }
          }
        });
        
        return () => observer.disconnect();
      }
    }
  }, [content]);

  return (
    <iframe
      ref={iframeRef}
      style={{
        width: '100%',
        minHeight: '200px',
        border: 'none',
        background: 'transparent',
        isolation: 'isolate',
        contain: 'layout style paint size'
      }}
      sandbox="allow-same-origin"
      title="Email Content"
    />
  );
};

export default IsolatedEmailContent;