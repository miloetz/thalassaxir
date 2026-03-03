defmodule Thalassaxir.Ocean.SessionSupervisor do
  @moduledoc """
  DynamicSupervisor that manages per-user ocean sessions.
  Each user gets their own isolated ocean with its own ships.
  """
  use DynamicSupervisor

  alias Thalassaxir.Ocean.Session

  # Session timeout (future use)
  # @session_timeout_ms 30 * 60 * 1000

  def start_link(opts) do
    DynamicSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc """
  Gets or creates a session for the given session_id.
  Returns {:ok, session_id} on success.
  """
  def get_or_create_session(session_id) do
    case Registry.lookup(Thalassaxir.Ocean.SessionRegistry, session_id) do
      [{_pid, _}] ->
        {:ok, session_id}

      [] ->
        start_session(session_id)
    end
  end

  @doc """
  Starts a new session for the given session_id.
  """
  def start_session(session_id) do
    child_spec = %{
      id: session_id,
      start: {Session, :start_link, [session_id]},
      restart: :temporary
    }

    case DynamicSupervisor.start_child(__MODULE__, child_spec) do
      {:ok, _pid} -> {:ok, session_id}
      {:error, {:already_started, _pid}} -> {:ok, session_id}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Stops and cleans up a session.
  """
  def stop_session(session_id) do
    case Registry.lookup(Thalassaxir.Ocean.SessionRegistry, session_id) do
      [{pid, _}] ->
        # Clean up ETS table
        try do
          :ets.delete(Session.crash_table_name(session_id))
        rescue
          _ -> :ok
        end

        DynamicSupervisor.terminate_child(__MODULE__, pid)

      [] ->
        {:error, :not_found}
    end
  end

  @doc """
  Lists all active session IDs.
  """
  def list_sessions do
    Registry.select(Thalassaxir.Ocean.SessionRegistry, [{{:"$1", :_, :_}, [], [:"$1"]}])
  end

  @doc """
  Returns the count of active sessions.
  """
  def count_sessions do
    DynamicSupervisor.count_children(__MODULE__).active
  end
end
