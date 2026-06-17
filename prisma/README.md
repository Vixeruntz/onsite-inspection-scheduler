# Prisma/PostgreSQL notes

The production datasource is PostgreSQL. Add this trigger in the first SQL migration to enforce the append-only DecisionLog rule at the database layer:

```sql
CREATE OR REPLACE FUNCTION prevent_decision_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DecisionLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decision_log_no_update
BEFORE UPDATE OR DELETE ON "DecisionLog"
FOR EACH ROW EXECUTE FUNCTION prevent_decision_log_mutation();
```
