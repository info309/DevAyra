import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-heading text-center">Privacy Policy</CardTitle>
            <p className="text-center text-muted-foreground">Last updated: January 2025</p>
          </CardHeader>
          <CardContent className="prose prose-lg max-w-none">
            <div className="space-y-6">
              <section>
                <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
                <p>
                  Stargate Labs Inc UK ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Ayra service and related applications.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
                <h3 className="text-xl font-semibold mb-2">Personal Information</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Email address and name for account creation</li>
                  <li>Email content when you connect your Gmail account</li>
                  <li>Calendar events and scheduling information</li>
                  <li>Documents and files you upload to our service</li>
                  <li>Notes and personal data you create within the platform</li>
                </ul>

                <h3 className="text-xl font-semibold mb-2 mt-4">Technical Information</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Device information and operating system</li>
                  <li>IP address and location data</li>
                  <li>Usage patterns and service interactions</li>
                  <li>Cookies and similar tracking technologies</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>To provide and maintain our AI assistant services</li>
                  <li>To process and organize your emails, calendar, and documents</li>
                  <li>To improve our AI capabilities and service quality</li>
                  <li>To communicate with you about service updates and support</li>
                  <li>To ensure security and prevent unauthorized access</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">4. Data Security</h2>
                <p>
                  We implement industry-standard security measures to protect your data:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>End-to-end encryption for data in transit and at rest</li>
                  <li>OAuth 2.0 authentication for third-party integrations</li>
                  <li>Row-level security in our database systems</li>
                  <li>Regular security audits and monitoring</li>
                  <li>Strict access controls and employee training</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">5. Data Sharing</h2>
                <p>
                  We do not sell your personal data. We may share information only in these limited circumstances:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>With your explicit consent</li>
                  <li>To comply with legal obligations</li>
                  <li>To protect our rights and prevent fraud</li>
                  <li>With trusted service providers under strict data processing agreements</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
                <p>Under UK GDPR, you have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access your personal data</li>
                  <li>Correct inaccurate information</li>
                  <li>Delete your data (right to be forgotten)</li>
                  <li>Restrict processing of your data</li>
                  <li>Data portability</li>
                  <li>Object to processing</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
                <p>
                  We retain your data only as long as necessary to provide our services and comply with legal obligations. You can delete your account and data at any time through your account settings.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold mb-4">8. Contact Us</h2>
                <p>
                  For any privacy-related questions or to exercise your rights, contact us at:
                </p>
                <p>
                  <strong>Stargate Labs Inc UK</strong><br />
                  Email: privacy@ayra.com<br />
                  Address: [Company Address]
                </p>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PrivacyPolicy;