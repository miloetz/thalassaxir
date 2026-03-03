defmodule Thalassaxir.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      ThalassaxirWeb.Telemetry,
      # No database needed - everything is in-memory processes
      {DNSCluster, query: Application.get_env(:thalassaxir, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Thalassaxir.PubSub},
      # Ocean simulation processes - per-session architecture
      {Registry, keys: :unique, name: Thalassaxir.Ocean.SessionRegistry},
      Thalassaxir.Ocean.SessionSupervisor,
      # Start to serve requests, typically the last entry
      ThalassaxirWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Thalassaxir.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    ThalassaxirWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
