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
        // Create completely isolated HTML with refined styles
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
              
              /* Base styles with proper design system colors */
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: hsl(20, 14%, 9%); /* --foreground */
                background: hsl(28, 100%, 98%); /* --card */
                margin: 0;
                padding: 24px;
                overflow-wrap: break-word;
                word-wrap: break-word;
                min-height: 100vh;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              
              /* Typography with design system colors */
              p { 
                margin-bottom: 16px; 
                line-height: 1.6;
                color: hsl(20, 14%, 9%);
              }
              h1, h2, h3, h4, h5, h6 { 
                margin-bottom: 16px; 
                font-weight: 600; 
                line-height: 1.3;
                color: hsl(20, 14%, 9%); /* --foreground */
              }
              h1 { font-size: 24px; }
              h2 { font-size: 20px; }
              h3 { font-size: 18px; }
              h4 { font-size: 16px; }
              
              /* Links with primary color */
              a {
                color: hsl(20, 83%, 38%); /* --primary */
                text-decoration: underline;
                transition: all 0.2s ease;
              }
              a:hover {
                color: hsl(20, 83%, 32%);
                text-decoration: none;
                opacity: 0.8;
              }
              
              /* Images with refined styling */
              img {
                max-width: 100% !important;
                height: auto !important;
                border-radius: 12px;
                display: block;
                margin: 16px auto;
                box-shadow: 0 4px 12px hsla(20, 14%, 9%, 0.08);
                transition: all 0.3s ease;
                border: 1px solid hsl(25, 25%, 85%); /* --border */
              }
              
              /* Handle broken images */
              img[src=""], img:not([src]), img[src*="cid:"] {
                display: none !important;
              }
              
              /* Tables with design system colors */
              table {
                border-collapse: collapse;
                width: 100%;
                margin: 20px 0;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 2px 8px hsla(20, 14%, 9%, 0.06);
                background: hsl(28, 100%, 98%); /* --card */
                border: 1px solid hsl(25, 25%, 85%); /* --border */
              }
              
              td, th {
                padding: 16px 20px;
                text-align: left;
                border-bottom: 1px solid hsl(25, 25%, 85%); /* --border */
                vertical-align: top;
              }
              
              th {
                background: hsl(25, 30%, 92%); /* --muted */
                font-weight: 600;
                color: hsl(20, 14%, 9%); /* --foreground */
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              
              tr:last-child td {
                border-bottom: none;
              }
              
              tr:hover {
                background: hsl(30, 100%, 85%); /* --accent */
              }
              
              /* Lists with proper spacing */
              ul, ol {
                margin: 18px 0;
                padding-left: 28px;
              }
              
              li {
                margin-bottom: 8px;
                line-height: 1.6;
                color: hsl(20, 14%, 9%);
              }
              
              /* Block elements with design system colors */
              blockquote {
                margin: 20px 0;
                padding: 20px 24px;
                border-left: 4px solid hsl(20, 83%, 38%); /* --primary */
                background: hsl(25, 30%, 92%); /* --muted */
                border-radius: 0 12px 12px 0;
                font-style: italic;
                color: hsl(20, 8%, 46%); /* --muted-foreground */
                position: relative;
              }
              
              blockquote::before {
                content: '"';
                font-size: 48px;
                color: hsl(20, 83%, 38%);
                position: absolute;
                top: -8px;
                left: 16px;
                font-family: Georgia, serif;
                opacity: 0.3;
              }
              
              /* Code blocks with design system colors */
              pre, code {
                font-family: 'SF Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                background: hsl(25, 30%, 92%); /* --muted */
                border-radius: 8px;
                padding: 4px 8px;
                font-size: 13px;
                color: hsl(20, 14%, 9%);
                border: 1px solid hsl(25, 25%, 85%);
              }
              
              pre {
                padding: 20px;
                margin: 20px 0;
                overflow-x: auto;
                line-height: 1.4;
              }
              
              /* Dividers with design system colors */
              hr {
                margin: 32px 0;
                border: none;
                height: 1px;
                background: linear-gradient(to right, transparent, hsl(25, 25%, 85%), transparent);
              }
              
              /* Email-specific elements */
              .email-signature {
                margin-top: 32px;
                padding-top: 20px;
                border-top: 2px solid hsl(25, 25%, 85%);
                font-size: 13px;
                color: hsl(20, 8%, 46%); /* --muted-foreground */
                background: hsl(25, 30%, 92%);
                padding: 20px;
                border-radius: 12px;
              }
              
              /* Enhanced content structure */
              .email-content {
                max-width: 100%;
                margin: 0 auto;
              }
              
              /* Better spacing for email elements */
              .email-content > *:first-child {
                margin-top: 0;
              }
              
              .email-content > *:last-child {
                margin-bottom: 0;
              }
              
              /* Outlook/Exchange specific fixes */
              div[style*="font-family"] {
                font-family: inherit !important;
              }
              
              /* Hide tracking pixels and analytics */
              img[width="1"], img[height="1"], img[style*="width:1px"], img[style*="height:1px"] {
                display: none !important;
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
              
              /* Dark mode support */
              @media (prefers-color-scheme: dark) {
                body {
                  background: #1f2937;
                  color: #f3f4f6;
                }
                h1, h2, h3, h4, h5, h6 {
                  color: #ffffff;
                }
                table {
                  background: #374151;
                }
                th {
                  background: #4b5563;
                  color: #f3f4f6;
                }
                tr:hover {
                  background: #4b5563;
                }
                blockquote {
                  background: #374151;
                  color: #d1d5db;
                }
                pre, code {
                  background: #374151;
                  color: #f3f4f6;
                }
              }
            </style>
          </head>
          <body>
            <div class="email-content">
              ${content || '<p style="color: #6b7280; font-style: italic; text-align: center; margin-top: 40px;">No content available</p>'}
            </div>
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
              200 // minimum height
            );
            iframe.style.height = `${height + 40}px`; // Add padding
          }
        };
        
        // Handle image loading and errors
        const handleImages = () => {
          const images = doc.querySelectorAll('img');
          images.forEach((img) => {
            // Remove tracking pixels
            if (img.width === 1 || img.height === 1) {
              img.remove();
              return;
            }
            
            // Handle CID references and broken images
            if (!img.src || img.src.includes('cid:') || img.src === '') {
              img.style.display = 'none';
              return;
            }
            
            // Add loading state
            img.style.opacity = '0';
            
            img.onload = () => {
              img.style.opacity = '1';
              resizeIframe();
            };
            
            img.onerror = () => {
              img.style.display = 'none';
              resizeIframe();
            };
          });
        };
        
        // Initial setup
        setTimeout(() => {
          handleImages();
          resizeIframe();
        }, 100);
        
        // Resize on content changes
        const observer = new MutationObserver(() => {
          handleImages();
          resizeIframe();
        });
        observer.observe(doc.body, { 
          childList: true, 
          subtree: true, 
          attributes: true 
        });
        
        // Prevent navigation and handle clicks
        iframe.contentWindow?.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'A') {
            e.preventDefault();
            const href = (target as HTMLAnchorElement).href;
            if (href && (href.startsWith('http') || href.startsWith('mailto:'))) {
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