# Agent Routing System

## Overview

The project orchestrator automatically delegates tasks to specialized agents based on task content and keywords. This ensures optimal expertise is applied to each area of the system.

## Routing Rules

### Automatic Agent Selection

When task slug or scope mentions:

- **"paymentcloud", "payment", "card", "webhook"** → `@payments-orchestrator`
- **"supabase", "schema", "rls", "policy", "realtime"** → `@supabase-architect`
- **"style", "theme", "tailwind", "ui polish"** → `@visual-polish-designer`
- **"db perf", "lock", "index", "concurrency", "anti-sniping internals"** → `@db-index-planner`
- **"compliance", "kyc", "license", "money transmitter"** → `@compliance-research-analyst`
- **"mobile", "ios", "android", "push"** → `@crypto-integration-planner`

**Default**: `@research-planner`

### Manual Override

Prefix with `@AgentName:` to force a specific sub-agent for single delegation:
```
@payments-orchestrator: Plan payment provider integration with webhook handling
```

## Delegation Contract

### 1. Documentation Requirements
- Create/append `docs/tasks/task-<slug>.md`
- Agent creates plan at `docs/research/<agent>-<slug>.md`
- Optional patches for `@visual-polish-designer` only

### 2. Implementation Flow
1. **Planning Phase**: Specialized agent creates research and implementation plan
2. **Implementation Phase**: Orchestrator implements based on plan
3. **Documentation Phase**: Update `docs/tasks/task-<slug>.md` with:
   - What changed
   - What's next
   - Lessons learned

### 3. Quality Gates
- All implementations must pass existing test suite
- New features require test coverage
- Breaking changes require migration plan
- Security review for payment/auth features

## Agent Specializations

### @payments-orchestrator
- **Expertise**: Payment processing, webhooks, PCI compliance
- **Deliverables**: Stripe integration plans, webhook handlers, test scenarios
- **Security Focus**: PII handling, signature verification, idempotency

### @supabase-architect
- **Expertise**: Database design, RLS policies, real-time subscriptions
- **Deliverables**: Schema migrations, security policies, performance optimizations
- **Focus Areas**: Multi-tenancy, scalability, data integrity

### @visual-polish-designer
- **Expertise**: UI/UX design, theme systems, responsive design
- **Deliverables**: Style guides, component designs, accessibility improvements
- **Constraints**: No logic changes, only visual enhancements

### @db-index-planner
- **Expertise**: Database performance, concurrency, locking strategies
- **Deliverables**: Index strategies, query optimizations, performance analysis
- **Focus Areas**: Auction mechanics, high-traffic scenarios

### @compliance-research-analyst
- **Expertise**: Legal compliance, regulatory requirements, industry standards
- **Deliverables**: Compliance documentation, risk assessments, legal guidance
- **Coverage**: Licensing, money transmission, data protection

### @research-planner (Default)
- **Expertise**: General development planning, architecture decisions
- **Deliverables**: Technical specifications, implementation roadmaps
- **Scope**: Cross-cutting concerns, integration planning

## Usage Examples

### Task E - Stripe Integration
```
Task E — Stripe Credit Packs Integration (MVP)
```
**Auto-routes to**: `@payments-orchestrator`
**Reason**: Contains "payment" and "provider" keywords

### Task F - Database Performance
```
Optimize bidding performance with better indexes
```
**Auto-routes to**: `@db-index-planner`
**Reason**: Contains "performance" and "indexes" keywords

### UI Polish Pass
```
@visual-polish-designer: Improve auction card visual design
```
**Manual route to**: `@visual-polish-designer`
**Reason**: Explicit agent specification

## Quality Assurance

### Pre-Implementation Checklist
- [ ] Task routed to appropriate agent
- [ ] Research plan created and reviewed
- [ ] Implementation approach validated
- [ ] Test coverage planned

### Post-Implementation Checklist
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Security review completed (if applicable)
- [ ] Performance impact assessed
- [ ] Next steps documented

## Monitoring and Metrics

Track agent effectiveness:
- **Task completion time** by agent type
- **Bug rate** in agent-specific deliverables
- **Review feedback** for routing accuracy
- **Agent specialization gaps** for future improvements

## Evolution

This routing system will evolve based on:
- New agent capabilities
- Task complexity patterns
- Performance feedback
- Domain expertise needs
