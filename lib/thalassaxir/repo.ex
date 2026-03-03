defmodule Thalassaxir.Repo do
  use Ecto.Repo,
    otp_app: :thalassaxir,
    adapter: Ecto.Adapters.Postgres
end
