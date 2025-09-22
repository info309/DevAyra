import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const AntiSlaveryPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-heading text-center">Anti-Slavery Policy</CardTitle>
            <p className="text-center text-muted-foreground">Last updated: January 2025</p>
          </CardHeader>
          <CardContent className="prose prose-lg max-w-none">
            <div className="space-y-6">
              <section>
                <h2 className="text-2xl font-semibold mb-4">1. Policy Statement</h2>
                <p>
                  Stargate Labs Inc UK is committed to preventing modern slavery and human trafficking in all its forms. We have zero tolerance for any form of modern slavery, including forced labor, debt bondage, human trafficking, and child labor in our business operations and supply chains.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">2. Our Commitment</h2>
                <p>
                  This policy reflects our commitment to acting ethically and with integrity in all our business relationships and to implementing and enforcing effective systems and controls to ensure slavery and human trafficking is not taking place anywhere in our supply chains.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">3. Organizational Structure</h2>
                <p>
                  As a UK-based technology company, we operate primarily in the software development and AI services sector. Our business model focuses on digital services with minimal physical supply chains, reducing our exposure to modern slavery risks.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">4. Our Supply Chains</h2>
                <p>
                  Our supply chains include:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Technology service providers and cloud infrastructure partners</li>
                  <li>Software licensing and development tools</li>
                  <li>Professional services and consultancy</li>
                  <li>Office equipment and facilities management</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">5. Due Diligence Processes</h2>
                <p>
                  We conduct due diligence on our suppliers and partners, including:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Contractual requirements for compliance with anti-slavery legislation</li>
                  <li>Risk assessments of new suppliers before engagement</li>
                  <li>Regular reviews of existing supplier relationships</li>
                  <li>Audit rights in supplier contracts where appropriate</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">6. Risk Assessment</h2>
                <p>
                  We regularly assess the risk of modern slavery in our operations and supply chains. Given our focus on technology services, we consider our overall risk to be low, but we remain vigilant and committed to continuous improvement.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">7. Employee Responsibilities</h2>
                <p>
                  All employees are expected to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Comply with this policy and report any concerns</li>
                  <li>Be aware of the signs of modern slavery</li>
                  <li>Raise concerns through appropriate channels</li>
                  <li>Support investigations and remediation efforts</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">8. Training and Awareness</h2>
                <p>
                  We provide training and awareness programs to ensure our team understands:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>The risks of modern slavery in our sector</li>
                  <li>How to identify and report potential issues</li>
                  <li>Their responsibilities under this policy</li>
                  <li>The legal requirements and consequences</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">9. Reporting Concerns</h2>
                <p>
                  We encourage the reporting of concerns about any aspect of modern slavery. Reports can be made:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>To management or HR directly</li>
                  <li>Through our confidential reporting channels</li>
                  <li>Anonymously if preferred</li>
                  <li>To external authorities if necessary</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">10. Remediation</h2>
                <p>
                  If we identify any instances of modern slavery, we commit to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Taking immediate action to address the situation</li>
                  <li>Working with suppliers to implement corrective measures</li>
                  <li>Terminating relationships if necessary</li>
                  <li>Supporting victims and reporting to authorities</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">11. Key Performance Indicators</h2>
                <p>
                  We measure our effectiveness through:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Regular supplier assessments and audits</li>
                  <li>Employee training completion rates</li>
                  <li>Number of concerns reported and investigated</li>
                  <li>Supplier compliance with our requirements</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">12. Contact Information</h2>
                <p>
                  For questions about this Anti-Slavery Policy or to report concerns, contact us at:
                </p>
                <p>
                  <strong>Stargate Labs Inc UK</strong><br />
                  Email: compliance@ayra.com<br />
                  Address: [Company Address]<br />
                  Phone: [Company Phone]
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">13. Policy Review</h2>
                <p>
                  This policy is reviewed annually and updated as necessary to ensure it remains effective and compliant with current legislation, including the Modern Slavery Act 2015.
                </p>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AntiSlaveryPolicy;