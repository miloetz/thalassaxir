defmodule Thalassaxir.Ocean.Session do
  @moduledoc """
  Supervisor for a single user's ocean session.
  Each session has its own Registry and ParticleSupervisor.
  """
  use Supervisor

  require Logger

  @max_particles 200

  def start_link(session_id) do
    Supervisor.start_link(__MODULE__, session_id, name: via_tuple(session_id))
  end

  def via_tuple(session_id) do
    {:via, Registry, {Thalassaxir.Ocean.SessionRegistry, session_id}}
  end

  @impl true
  def init(session_id) do
    # Create ETS table for crash positions (per-session)
    # Use try/catch in case table already exists from a crashed session
    table_name = crash_table_name(session_id)
    try do
      :ets.new(table_name, [:named_table, :public, :set])
    catch
      :error, :badarg ->
        # Table already exists, delete and recreate
        :ets.delete(table_name)
        :ets.new(table_name, [:named_table, :public, :set])
    end

    children = [
      # Per-session particle registry
      {Registry, keys: :unique, name: registry_name(session_id)},
      # Per-session particle supervisor
      {DynamicSupervisor, strategy: :one_for_one, name: supervisor_name(session_id)}
    ]

    Supervisor.init(children, strategy: :one_for_all)
  end

  # --- Public API ---

  def registry_name(session_id), do: :"particle_registry_#{session_id}"
  def supervisor_name(session_id), do: :"particle_supervisor_#{session_id}"
  def crash_table_name(session_id), do: :"particle_crashes_#{session_id}"
  def pubsub_topic(session_id), do: "ocean:#{session_id}"

  @doc """
  Spawns a new particle in this session.
  """
  def spawn_particle(session_id, opts \\ []) do
    count = count_particles(session_id)
    if count >= @max_particles do
      {:error, :max_particles_reached}
    else
      id = Keyword.get(opts, :id, generate_id())

      # Check if this is a repair (crashed ship being restarted)
      opts =
        case pop_crash_data(session_id, id) do
          {:ok, position, color} ->
            opts
            |> Keyword.put(:id, id)
            |> Keyword.put(:position, position)
            |> Keyword.put(:color, color)
            |> Keyword.put(:is_repair, true)
            |> Keyword.put(:session_id, session_id)

          :error ->
            opts
            |> Keyword.put(:id, id)
            |> Keyword.put(:session_id, session_id)
        end

      child_spec = %{
        id: id,
        start: {Thalassaxir.Ocean.SessionParticle, :start_link, [opts]},
        restart: :transient
      }

      case DynamicSupervisor.start_child(supervisor_name(session_id), child_spec) do
        {:ok, pid} -> {:ok, pid, id}
        {:error, reason} -> {:error, reason}
      end
    end
  rescue
    e ->
      Logger.error("spawn_particle error: #{inspect(e)}")
      {:error, :session_error}
  end

  @doc """
  Spawns multiple particles in this session.
  """
  def spawn_particles(session_id, count, opts \\ []) when count > 0 do
    Enum.map(1..count, fn _ -> spawn_particle(session_id, opts) end)
  end

  @doc """
  Kills a specific particle by ID.
  """
  def kill_particle(session_id, id) do
    Thalassaxir.Ocean.SessionParticle.kill(session_id, id)
  end

  @doc """
  Kills a random particle.
  """
  def kill_random_particle(session_id) do
    case list_particle_ids(session_id) do
      [] -> {:error, :no_particles}
      ids ->
        id = Enum.random(ids)
        kill_particle(session_id, id)
    end
  end

  @doc """
  Crashes a random particle - supervisor will restart it.
  """
  def crash_random_particle(session_id) do
    case list_particle_ids(session_id) do
      [] -> {:error, :no_particles}
      ids ->
        id = Enum.random(ids)
        Thalassaxir.Ocean.SessionParticle.crash(session_id, id)
    end
  end

  @doc """
  Storm damages a random particle.
  """
  def storm_random_particle(session_id) do
    case list_particle_ids(session_id) do
      [] -> {:error, :no_particles}
      ids ->
        id = Enum.random(ids)
        Thalassaxir.Ocean.SessionParticle.storm(session_id, id)
    end
  end

  @doc """
  Kills all particles in this session immediately (no stagger).
  """
  def kill_all_particles(session_id) do
    # Get all particle IDs and kill them directly
    ids = list_particle_ids(session_id)
    Logger.info("kill_all_particles: found #{length(ids)} particles")

    ids
    |> Enum.with_index()
    |> Enum.each(fn {id, index} ->
      # Stagger kills for visual effect
      delay = index * 20 + :rand.uniform(30)
      Task.start(fn ->
        Process.sleep(delay)
        kill_particle(session_id, id)
      end)
    end)

    :ok
  rescue
    e ->
      Logger.error("kill_all_particles error: #{inspect(e)}")
      :error
  end

  @doc """
  Returns the count of active particles in this session.
  """
  def count_particles(session_id) do
    DynamicSupervisor.count_children(supervisor_name(session_id)).active
  rescue
    _ -> 0
  catch
    :exit, _ -> 0
  end

  @doc """
  Returns list of all particle IDs in this session.
  """
  def list_particle_ids(session_id) do
    Registry.select(registry_name(session_id), [{{:"$1", :_, :_}, [], [:"$1"]}])
  rescue
    _ -> []
  catch
    :exit, _ -> []
  end

  @doc """
  Returns all particle states in this session.
  """
  def get_all_particle_states(session_id) do
    list_particle_ids(session_id)
    |> Enum.map(&Thalassaxir.Ocean.SessionParticle.get_state(session_id, &1))
    |> Enum.filter(&match?({:ok, _}, &1))
    |> Enum.map(fn {:ok, state} -> state end)
  end

  @doc """
  Records crash position for repair animation.
  """
  def record_crash(session_id, id, position, color) do
    :ets.insert(crash_table_name(session_id), {id, position, color, DateTime.utc_now()})
  rescue
    _ -> :error
  end

  @doc """
  Gets and removes crash data for a restarting particle.
  """
  def pop_crash_data(session_id, id) do
    table = crash_table_name(session_id)
    case :ets.lookup(table, id) do
      [{^id, position, color, _time}] ->
        :ets.delete(table, id)
        {:ok, position, color}
      [] ->
        :error
    end
  rescue
    _ -> :error
  catch
    :exit, _ -> :error
  end

  defp generate_id do
    :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
  end
end
