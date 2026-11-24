# AGENTS.md

# ABT CPD Complaint Analytics and Prediction Platform

## 1. Project Role and Responsibility

Act as a senior full stack software architect, senior frontend engineer, senior backend engineer, senior data engineer, senior data scientist, and ML integration engineer.

Your responsibility is to build a complete, production structured web application for the ABT CPD Complaint Analytics and Prediction project.

This is not a static dashboard or a frontend demonstration. It must be a working application with a real backend, database, data processing pipeline, ML and NLP integration, authentication, APIs, dashboards, and reliable data persistence.

The existing machine learning and NLP project is supplied separately as a ZIP archive.

Your first responsibility is to understand that existing project completely. Do not replace, rewrite, or ignore the existing ML models without a technically justified reason.

Build the website around the actual capabilities, input requirements, output formats, and limitations of the supplied models.

Do not fabricate model accuracy, prediction results, datasets, business statistics, or completed functionality.

## 2. Project Overview

Project name:

ABT CPD Zero Complaint Analytics and Prediction Platform

### Business problem

The project aims to help an organization analyze historical customer complaints, identify recurring product defects, understand root causes, evaluate corrective and preventive actions, identify emerging quality problems, and reduce future complaints.

The application should provide a central platform where authorized users can:

1. Upload and manage complaint data.
2. Analyze historical complaints.
3. Identify recurring complaint patterns.
4. Classify complaint descriptions using NLP.
5. Find similar historical complaints.
6. Examine recorded root causes.
7. Review corrective and preventive actions.
8. Identify recurring problems after action closure.
9. Analyze product and batch level quality risks where supporting data exists.
10. View management dashboards and quality indicators.
11. Generate evidence based insights and reports.
12. Submit new records for analysis through the available ML pipeline.

### Important implementation principle

The system must distinguish between:

1. Actual recorded information.
2. Machine learning predictions.
3. NLP classifications.
4. Similarity based recommendations.
5. Rule based calculations.
6. Human verified conclusions.
7. Demonstration or synthetic data.

Never present a prediction as a confirmed fact.

## 3. Mandatory Initial Project Inspection

Before building anything, inspect the complete repository and all supplied project files.

First identify:

1. Existing project structure.
2. Existing frontend code, if any.
3. Existing backend code, if any.
4. Existing database configuration.
5. Existing ML and NLP ZIP archive.
6. Existing documentation.
7. Existing environment files and dependency files.
8. Existing datasets and model artifacts.
9. Existing scripts and notebooks.
10. Existing API endpoints and integrations.

Do not delete or overwrite existing work before understanding its purpose.

Create a project inspection report explaining what already exists, what is reusable, what is incomplete, and what must be developed.

## 4. Mandatory Machine Learning ZIP Inspection

The supplied ML and NLP ZIP archive is a critical project dependency.

Before integration, inspect the entire archive.

Do not assume that the model is trained, production ready, accurate, or capable of processing every type of input.

### Inspect every relevant file

Identify:

1. Model files and serialized artifacts.
2. Python source files.
3. Jupyter notebooks.
4. Training scripts.
5. Inference scripts.
6. Preprocessing scripts.
7. Tokenizers and vectorizers.
8. Label encoders.
9. Feature extraction logic.
10. Configuration files.
11. Dependency files.
12. Dataset samples.
13. Evaluation reports.
14. Saved embeddings.
15. NLP pipelines.
16. Model checkpoints.
17. Documentation.

### Determine the actual model capabilities

For every model, document:

1. Model name and purpose.
2. Model type and algorithm.
3. Whether it is trained or requires training.
4. Expected input fields.
5. Expected input data types.
6. Required preprocessing.
7. Expected output format.
8. Output classes or labels.
9. Confidence score availability.
10. Evaluation metrics, if available.
11. Training dataset details, if available.
12. Known limitations.
13. Required Python version.
14. Required libraries.
15. Whether the model can run independently.
16. Whether inference code is already implemented.

### Critical restrictions

Do not train a new model automatically.

Do not replace existing models with dummy predictions.

Do not invent confidence scores.

Do not assume that a classification model can predict root causes.

Do not assume that a complaint model can process demo booking information.

Do not change preprocessing without checking whether it would make inference inconsistent with training.

If model artifacts are missing, dependencies are incompatible, or inference code is incomplete, report the exact problem and propose a correction.

Create:

`docs/ML_MODEL_AUDIT.md`

This document must describe every discovered model, its input schema, output schema, dependencies, readiness, limitations, and integration approach.

## 5. Data Inspection and Data Engineering

Inspect every supplied dataset before building the data pipeline.

For every file and every worksheet, inspect:

1. File name and format.
2. Worksheet names.
3. Total rows.
4. Total columns.
5. Column names.
6. Data types.
7. Missing values.
8. Duplicate records.
9. Unique values.
10. Date ranges.
11. Invalid values.
12. Inconsistent naming.
13. Identifier fields.
14. Potential relationships between datasets.
15. Data quality issues.

Determine whether the available data supports complaint analysis, product analysis, batch analysis, root cause analysis, CAPA analysis, production analysis, shipment analysis, and predictive modelling.

Identify which relationships are confirmed by actual identifiers and which are only possible relationships.

Never create false relationships between records.

Preserve the original source data.

Use separate raw, cleaned, and processed data layers.

Create:

`docs/DATA_INVENTORY.md`

`docs/DATA_DICTIONARY.md`

`docs/DATA_QUALITY_REPORT.md`

`docs/DATA_READINESS_REPORT.md`

## 6. Required Application Architecture

Use a clear separation between frontend, backend, database, and ML inference.

### Frontend

Preferred stack:

1. React.
2. Vite.
3. TypeScript.
4. Tailwind CSS.
5. Reusable component architecture.
6. Recharts or Plotly for visualizations.
7. React Router.
8. A suitable form validation library.

The frontend must communicate with the backend through documented APIs.

Do not put model execution, database credentials, or sensitive business logic in frontend code.

### Backend

Preferred stack:

1. Python.
2. FastAPI.
3. Pydantic for validation.
4. SQLAlchemy for database access.
5. Pandas and NumPy for data processing.
6. Scikit learn and other verified ML dependencies.
7. A dedicated inference service layer.

Use modular backend architecture.

Separate authentication, database access, data ingestion, business logic, ML inference, analytics, and reporting.

### Database

Preferred database:

PostgreSQL, preferably through Supabase.

Use a relational schema with appropriate primary keys, foreign keys, constraints, indexes, and timestamps.

Never store important application data only in frontend state.

Persist uploaded records, analysis results, prediction outputs, user actions, and audit information.

### Suggested structure

```text
project/
    frontend/
        src/
            components/
            pages/
            layouts/
            services/
            hooks/
            types/
            utils/
            charts/
    backend/
        app/
            api/
            core/
            database/
            models/
            schemas/
            services/
            ml/
            analytics/
            ingestion/
            utils/
            main.py
        tests/
        requirements.txt
    ml_project/
        original/
        integration/
    docs/
    scripts/
    .env.example
    README.md
    AGENTS.md
```

Adapt this structure to the actual repository. Do not duplicate existing modules unnecessarily.

## 7. Machine Learning Integration Architecture

The existing ML project must be integrated into the FastAPI backend.

The frontend must never directly load Python model files.

Create an independent ML service layer.

Suggested responsibilities:

1. Model loading.
2. Input validation.
3. Preprocessing.
4. Feature extraction.
5. Model inference.
6. Output validation.
7. Confidence interpretation.
8. Similarity retrieval.
9. Result persistence.
10. Error handling.

Load reusable model artifacts efficiently rather than reloading them for every request.

Use the original preprocessing pipeline wherever possible.

If the model requires a particular column order, vocabulary, encoder, tokenizer, or feature transformation, preserve it exactly.

Do not silently change the model's expected input.

### Model registry

Create a simple model registry documenting:

1. Model identifier.
2. Model version.
3. Model file location.
4. Model purpose.
5. Input schema.
6. Output schema.
7. Preprocessing version.
8. Deployment status.
9. Last validation date.

This should make future model updates manageable.

## 8. End to End Prediction Workflow

Every supported ML prediction must follow this sequence:

1. User submits a supported record through the website.
2. Frontend validates basic form requirements.
3. Backend receives the request.
4. Backend authenticates and authorizes the user.
5. Backend validates the complete input schema.
6. Backend checks missing and invalid fields.
7. Backend normalizes the input.
8. Backend applies the exact preprocessing required by the model.
9. Backend sends the processed features to the correct model.
10. Model generates an output.
11. Backend validates the model output.
12. Backend calculates or interprets confidence only when supported.
13. Backend applies appropriate business rules.
14. Backend stores the input and result.
15. Backend returns a structured response.
16. Frontend displays the result with explanations and limitations.
17. User can review, confirm, reject, or correct the result where applicable.
18. The system records the review and subsequent changes.

Every prediction should have a unique identifier and timestamp.

Store the model version used for each prediction.

Do not overwrite earlier prediction results when a new model version is introduced.

## 9. Handling New Data and Demo Bookings

The application may contain a request a demo page.

This page is a lead generation and booking feature.

A demo booking should:

1. Collect the visitor's name.
2. Collect organization details.
3. Collect email address.
4. Collect phone number if required.
5. Collect preferred date and time.
6. Collect the purpose of the demonstration.
7. Validate the submitted information.
8. Store the booking in the database.
9. Display a booking confirmation.
10. Notify the administrator through a configured notification mechanism.

A demo booking is not a complaint record.

Do not send demo booking fields through complaint classification, root cause prediction, batch risk prediction, or any other model unless the ML audit proves that a specific model is designed to accept those fields.

If the user submits a new complaint or quality record, send it through the relevant verified model workflow.

Keep booking workflows and complaint analytics workflows separate.

## 10. Application Modules

Build the application with the following modules, subject to actual data and model readiness.

### A. Authentication and User Management

Include:

1. Login.
2. Logout.
3. Protected pages.
4. Role based access.
5. Administrator permissions.
6. Analyst permissions.
7. Appropriate session management.

Never expose database credentials or secret keys in frontend code.

### B. Main Dashboard

Display meaningful management information.

Potential metrics:

1. Total complaints.
2. Complaints by month.
3. Complaints by product.
4. Complaints by category.
5. Critical complaints.
6. Repeat complaints.
7. Open investigations.
8. CAPA status.
9. Recurrence after CAPA closure.
10. Product or batch risk indicators.

Only display metrics that can be calculated from actual data.

Clearly identify unavailable metrics.

### C. Complaint Management

Allow authorized users to:

1. View complaint records.
2. Search complaints.
3. Filter by date.
4. Filter by product.
5. Filter by category.
6. Filter by severity.
7. Open complaint details.
8. Add new complaints.
9. Edit permitted fields.
10. View related analysis.

### D. NLP Complaint Intelligence

Use the existing NLP models where verified.

Possible features include:

1. Complaint text classification.
2. Defect category identification.
3. Similar complaint retrieval.
4. Recurring complaint detection.
5. Complaint trend analysis.
6. Keyword and topic analysis.

Show the actual model output.

Display confidence only if the model provides a meaningful score or a defensible calibration method exists.

### E. Root Cause Intelligence

Display recorded root causes and link them to related complaints where identifiers support the relationship.

Provide similar historical cases as evidence.

Clearly distinguish:

1. Recorded root cause.
2. Predicted possible cause.
3. Suggested investigation direction.
4. Human confirmed root cause.

Never present an inferred root cause as confirmed.

### F. CAPA Effectiveness

Track corrective and preventive actions.

Show:

1. CAPA description.
2. Related complaint.
3. Assigned owner.
4. Creation date.
5. Closure date.
6. Current status.
7. Recurrence after closure.
8. Evidence of effectiveness.

A closed CAPA must not automatically be classified as effective.

Use later recurrence records and supporting production or shipment data when available.

If the necessary information is unavailable, show that effectiveness cannot yet be established.

### G. Product and Batch Risk

Build risk analysis only when the dataset supports it.

Before implementing batch prediction, verify that complaint records can be linked to production batches and that the model has a valid prediction target and time horizon.

Do not use information that would not have been available at the time of prediction.

If batch level prediction is not supported, provide product or process level monitoring instead.

Clearly explain the level at which risk is being estimated.

### H. Reports and Analytics

Include:

1. Complaint trends.
2. Pareto analysis.
3. Product comparison.
4. Defect category distribution.
5. Recurrence analysis.
6. CAPA analysis.
7. Time based trends.
8. Exportable reports.

Use real database queries and verified calculations.

### I. Data Upload and Management

Support suitable formats such as CSV and Excel.

Include:

1. File validation.
2. Worksheet selection.
3. Column mapping.
4. Data preview.
5. Validation errors.
6. Duplicate detection.
7. Import summary.
8. Import history.
9. Audit logs.

Do not silently accept invalid data.

Do not modify original uploaded files.

## 11. Prediction Result Presentation

Every model result must be understandable to a nontechnical user.

Show:

1. Submitted input.
2. Analysis status.
3. Model name and version.
4. Predicted category or output.
5. Confidence or uncertainty, when supported.
6. Important input factors, when supported by the model.
7. Similar historical records, when available.
8. Recommended next step.
9. Data limitations.
10. Human review status.

Use clear labels such as:

Recorded fact

Model prediction

Possible explanation

Human verified

Insufficient data

Do not display a prediction as certain merely because the model returned a label.

If a model is uncertain, the result should explicitly communicate that uncertainty.

If required inputs are missing, reject the prediction or return an insufficient data result rather than inventing an answer.

## 12. API Design

Use documented REST APIs through FastAPI.

Suggested endpoint groups:

```text
/api/auth
/api/dashboard
/api/complaints
/api/complaints/upload
/api/ml/models
/api/ml/predict
/api/ml/similar
/api/analytics
/api/capa
/api/products
/api/batches
/api/reports
/api/demo-bookings
/api/admin
```

These are proposed endpoint groups. Adapt them to the actual application.

For every endpoint define:

1. HTTP method.
2. Request schema.
3. Response schema.
4. Authentication requirements.
5. Validation rules.
6. Error responses.
7. Database operations.
8. Tests.

Do not expose unrestricted model inference endpoints to unauthenticated users.

## 13. Database Design

Create a normalized database schema based on the actual business entities and available source data.

Potential entities:

1. Users.
2. Roles.
3. Complaints.
4. Products.
5. Batches.
6. Customers.
7. Root causes.
8. CAPA records.
9. Production records.
10. Shipment records.
11. Model predictions.
12. Model versions.
13. Upload history.
14. Audit logs.
15. Demo bookings.

Do not create mandatory relationships that cannot be supported by source identifiers.

Use nullable foreign keys when a relationship is genuinely optional.

Maintain timestamps and record provenance.

Store the original source identifier wherever possible.

## 14. Frontend Design Requirements

Build a professional enterprise quality analytics application.

The interface should look like a real industrial analytics and quality management product.

Avoid generic templates and excessive decoration.

Use:

1. Consistent typography.
2. Clear visual hierarchy.
3. Consistent spacing.
4. Reusable components.
5. Accessible forms.
6. Responsive tables.
7. Meaningful charts.
8. Clear status indicators.
9. Useful loading states.
10. Error and empty states.
11. Confirmation dialogs for important actions.
12. Responsive layouts.

Suggested navigation:

1. Overview.
2. Complaints.
3. AI Analysis.
4. Root Cause Intelligence.
5. CAPA Effectiveness.
6. Product and Batch Risk.
7. Analytics.
8. Data Management.
9. Reports.
10. Demo Bookings.
11. Settings.

Adjust navigation according to implemented functionality and user permissions.

Do not display nonfunctional menu items.

Do not use fabricated dashboard statistics to make the website appear complete.

## 15. Security and Reliability

Implement:

1. Server side input validation.
2. Authentication and authorization.
3. Secure password handling.
4. Environment variable management.
5. File type and size validation.
6. SQL injection protection.
7. Rate limiting where appropriate.
8. CORS configuration.
9. Safe error handling.
10. Audit logging.
11. Backup strategy.
12. Data access restrictions.

Never commit secrets, API keys, passwords, or private database credentials.

Do not send confidential complaint data to external AI services without explicit authorization.

## 16. Testing Requirements

Test the entire application, not just individual pages.

### Frontend tests

Test:

1. Navigation.
2. Forms.
3. Validation.
4. Tables.
5. Filters.
6. Charts.
7. Authentication flows.
8. Loading states.
9. Error states.
10. Mobile layouts.

### Backend tests

Test:

1. API validation.
2. Authentication.
3. Database operations.
4. File uploads.
5. Data processing.
6. Model loading.
7. Model inference.
8. Prediction persistence.
9. Error handling.
10. Authorization.

### ML integration tests

Test:

1. Valid input.
2. Missing input.
3. Invalid input.
4. Empty complaint text.
5. Unexpected categories.
6. Model loading failure.
7. Preprocessing failure.
8. Inference failure.
9. Invalid model output.
10. Confidence handling.
11. Model version tracking.

Use known test examples from the existing ML project.

Do not treat a successful API response as proof that the model is accurate.

### End to end tests

Verify that a new supported complaint record can travel through the complete workflow:

Frontend submission → Backend validation → Database input record → Preprocessing → ML inference → Output validation → Result persistence → Frontend result display.

Also verify that a demo booking follows its separate booking workflow.

## 17. Development Sequence

Follow this order.

### Phase 1: Repository and ML audit

Inspect the existing repository and ZIP archive.

Produce the ML audit and project inspection reports.

Identify missing dependencies and integration blockers.

Do not begin frontend development before understanding the existing model interfaces.

### Phase 2: Architecture and database

Define the application architecture.

Create the database schema.

Configure environment variables.

Establish API contracts.

### Phase 3: Backend development

Build authentication, database access, data ingestion, complaint management, demo bookings, analytics, and the ML service layer.

### Phase 4: ML integration

Integrate the verified existing model artifacts.

Preserve training time preprocessing.

Test inference independently.

Expose verified inference through backend APIs.

### Phase 5: Frontend development

Build the complete responsive interface.

Connect each functional page to real backend APIs.

### Phase 6: Integration

Connect the frontend, backend, database, and ML service.

Test complete workflows.

### Phase 7: Verification

Run automated tests.

Check logs and error handling.

Verify prediction outputs.

Check database persistence.

Verify desktop and mobile rendering.

### Phase 8: Deployment

Prepare production configuration.

Document deployment steps.

Verify environment variables and database connectivity.

Deploy only after the application passes the required tests.

## 18. Reference Template Handling

When the user pastes a reference website template, HTML, screenshot, or description:

1. Treat it strictly as a structural and layout reference, not as content to copy directly.
2. Identify and list the layout structure, section order, spacing patterns, navigation style, typography scale, and interaction patterns.
3. Do not assume brand colors, logos, or copy from the reference apply to this website.
4. State what was extracted from the reference before building so the user can correct it early.

## 19. Mandatory Questions Before Any Build

At the start of a new build task, ask only for information that is genuinely missing.

Determine:

1. What is the exact purpose of the page or section?
2. What content should it contain?
3. Which sections are required and in what order?
4. Which colors, fonts, and brand assets should be used?
5. Is desktop first or mobile first the priority?
6. Which interactions are required?

If the answer already exists in the conversation or project files, do not ask again. State the assumption and proceed.

Do not repeatedly ask questions whose answers are already known.

Do not delay technical inspection by asking unnecessary design questions.

## 20. Screenshot Verification and Comparison

Every time a new HTML output or meaningful frontend update is created:

1. Render the application using an available browser automation tool.
2. Capture a full page desktop screenshot.
3. Capture a full page mobile screenshot.
4. Inspect both screenshots.
5. Compare against the supplied reference screenshot when one exists.
6. Identify layout differences, missing sections, overflow, spacing issues, and responsiveness problems.
7. Correct visible problems before reporting the work as complete.

If the required browser rendering tool is unavailable, state that plainly.

Never claim that a screenshot was captured if it was not.

## 21. Self Correction Rule

If an earlier decision does not match the user's stated direction, identify the mismatch.

Correct it immediately.

Explain what changed and why.

Do not quietly carry forward a mistake simply because implementation has already started.

If an earlier architecture or model integration assumption proves incorrect, revise the design based on evidence.

## 22. Direction Clarity Rule

At the end of every response involving development, state the current project status in one concise line.

For example:

Project status: ML archive inspected, backend architecture defined, database implementation not started.

Always identify completed work, current work, blockers, and the next step.

Never claim that a feature is complete unless it has been implemented and verified.

## 23. Documentation

Maintain the following documentation:

```text
docs/
    PROJECT_OVERVIEW.md
    ARCHITECTURE.md
    ML_MODEL_AUDIT.md
    DATA_INVENTORY.md
    DATA_DICTIONARY.md
    DATA_QUALITY_REPORT.md
    DATA_READINESS_REPORT.md
    DATABASE_SCHEMA.md
    API_DOCUMENTATION.md
    TESTING_REPORT.md
    DEPLOYMENT_GUIDE.md
    KNOWN_LIMITATIONS.md
```

Update documentation whenever implementation decisions change.

## 24. Final Acceptance Criteria

The project is not complete until:

1. The frontend runs successfully.
2. The backend runs successfully.
3. The database connection works.
4. Authentication works.
5. Data upload works.
6. Complaint records persist.
7. Verified ML models load successfully.
8. Supported inputs pass through the correct preprocessing pipeline.
9. Model inference returns validated outputs.
10. Prediction results persist in the database.
11. The frontend displays actual backend results.
12. Unsupported inputs are handled safely.
13. Demo bookings work independently.
14. Dashboards use actual stored data.
15. Error handling works.
16. Automated tests pass.
17. Desktop and mobile layouts are verified.
18. Deployment instructions are documented.
19. Known limitations are disclosed.

A visually complete website with disconnected or simulated ML functionality does not satisfy this project.

A model connected to an API without validated input, output, persistence, and testing does not satisfy this project.

The final deliverable must be a working, integrated full stack application.