defmodule Thalassaxir.Ocean.SessionParticle do
  @moduledoc """
  A GenServer representing a ship in a user's private ocean.
  Each ship is a live Elixir process with its own state.
  """
  use GenServer

  alias Phoenix.PubSub
  alias Thalassaxir.Ocean.Session

  @pubsub Thalassaxir.PubSub

  # Ocean bounds for random positioning
  @ocean_bounds %{
    x: {-50, 50},
    y: {-20, 20},
    z: {-50, 50}
  }

  @colors ["#ffffff"]

  defstruct [:id, :session_id, :position, :velocity, :color, :created_at, :heading]

  # --- Public API ---

  def start_link(opts \\ []) do
    id = Keyword.get(opts, :id, generate_id())
    session_id = Keyword.fetch!(opts, :session_id)
    GenServer.start_link(__MODULE__, opts, name: via_tuple(session_id, id))
  end

  def get_state(session_id, id) do
    GenServer.call(via_tuple(session_id, id), :get_state)
  catch
    :exit, _ -> {:error, :not_found}
  end

  def kill(session_id, id) do
    GenServer.stop(via_tuple(session_id, id), :normal)
  catch
    :exit, _ -> {:error, :not_found}
  end

  def crash(session_id, id) do
    GenServer.cast(via_tuple(session_id, id), :crash)
  catch
    :exit, _ -> {:error, :not_found}
  end

  def storm(session_id, id) do
    GenServer.cast(via_tuple(session_id, id), :storm)
  catch
    :exit, _ -> {:error, :not_found}
  end

  def via_tuple(session_id, id) do
    {:via, Registry, {Session.registry_name(session_id), id}}
  end

  # --- GenServer Callbacks ---

  @impl true
  def init(opts) do
    id = Keyword.get(opts, :id, generate_id())
    session_id = Keyword.fetch!(opts, :session_id)
    position = Keyword.get(opts, :position, random_position())
    color = Keyword.get(opts, :color, random_color())
    is_repair = Keyword.get(opts, :is_repair, false)

    state = %__MODULE__{
      id: id,
      session_id: session_id,
      position: position,
      velocity: %{x: 0.0, y: 0.0, z: 0.0},
      color: color,
      created_at: DateTime.utc_now(),
      heading: :rand.uniform() * :math.pi() * 2
    }

    topic = Session.pubsub_topic(session_id)

    if is_repair do
      PubSub.broadcast(@pubsub, topic, {:particle_repairing, to_map(state)})
    else
      PubSub.broadcast(@pubsub, topic, {:particle_spawned, to_map(state)})
    end

    {:ok, state}
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, {:ok, to_map(state)}, state}
  end

  @impl true
  def handle_cast(:crash, state) do
    Session.record_crash(state.session_id, state.id, state.position, state.color)

    topic = Session.pubsub_topic(state.session_id)
    PubSub.broadcast(
      @pubsub,
      topic,
      {:particle_died,
       %{
         id: state.id,
         reason: :crashed,
         position: state.position
       }}
    )

    {:stop, :crashed, state}
  end

  @impl true
  def handle_cast(:storm, state) do
    topic = Session.pubsub_topic(state.session_id)
    PubSub.broadcast(
      @pubsub,
      topic,
      {:particle_stormed,
       %{
         id: state.id,
         position: state.position
       }}
    )

    {:noreply, state}
  end

  @impl true
  def terminate(:normal, state) do
    topic = Session.pubsub_topic(state.session_id)
    PubSub.broadcast(@pubsub, topic, {:particle_died, %{id: state.id, reason: :killed}})
    :ok
  end

  @impl true
  def terminate(:shutdown, state) do
    topic = Session.pubsub_topic(state.session_id)
    PubSub.broadcast(@pubsub, topic, {:particle_died, %{id: state.id, reason: :killed}})
    :ok
  end

  @impl true
  def terminate({:shutdown, _}, state) do
    topic = Session.pubsub_topic(state.session_id)
    PubSub.broadcast(@pubsub, topic, {:particle_died, %{id: state.id, reason: :killed}})
    :ok
  end

  @impl true
  def terminate(_reason, _state) do
    :ok
  end

  # --- Private Helpers ---

  defp generate_id do
    :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
  end

  defp random_position do
    {min_x, max_x} = @ocean_bounds.x
    {min_y, max_y} = @ocean_bounds.y
    {min_z, max_z} = @ocean_bounds.z

    %{
      x: random_float(min_x, max_x),
      y: random_float(min_y, max_y),
      z: random_float(min_z, max_z)
    }
  end

  defp random_float(min, max) do
    min + :rand.uniform() * (max - min)
  end

  defp random_color do
    Enum.random(@colors)
  end

  defp to_map(%__MODULE__{} = state) do
    %{
      id: state.id,
      position: state.position,
      color: state.color,
      heading: state.heading,
      pid: inspect(self()),
      uptime_ms: DateTime.diff(DateTime.utc_now(), state.created_at, :millisecond)
    }
  end
end
