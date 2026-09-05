from pathlib import Path

path = Path("apps/mobile/__tests__/services/recurring-payment-service.test.ts")
text = path.read_text()
old = 'id === "account-1" ? Promise.resolve({ id, userId: "user-1" }) : Promise.resolve(payment)'
new = 'id === "account-1" ? Promise.resolve({ id, userId: "user-1", currency: "EGP" }) : Promise.resolve(payment)'
count = text.count(old)
if count != 2:
    raise RuntimeError(f"Expected two incomplete account fixtures, found {count}")
path.write_text(text.replace(old, new, 2))
print("Aligned completed-series account fixtures with the owned EGP account contract")
